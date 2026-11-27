import { expect } from "@playwright/test";
import { createServer } from "node:http";
import { once } from "node:events";
import { resolve } from "node:path";
import type { browser } from "wxt/browser";
import { handleOnlineRequest, models } from "../../worker";
import { type OnlineBatch } from "../../src/online/protocol";
import { storage, test } from "../support/extension-fixture";
import { annotation, appendPosts, openTimeline } from "../support/x-timeline";

declare const chrome: typeof browser;
const origin = process.env.MD_ONLINE_E2E_ORIGIN;
test.skip(
  !origin,
  "Run the separately configured online extension with npm run test:e2e:online.",
);

let received: OnlineBatch[];
let inferences: number;
let completed: number;
let releaseInference: (() => void) | undefined;
let behavior:
  | "normal"
  | "quota"
  | "malformed"
  | "timeout"
  | "delayed"
  | "partial"
  | "recover";

test.beforeEach(async () => {
  received = [];
  inferences = 0;
  completed = 0;
  releaseInference = undefined;
  behavior = "normal";
  const server = createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString();
      received.push(JSON.parse(body));
      const reply = await handleOnlineRequest(
        new Request(`${origin}${req.url}`, {
          method: req.method,
          headers: { "Content-Type": "application/json" },
          body,
        }),
        {
          LLM_MODEL: models[0],
          RATE_LIMITER: {
            limit: async () => ({
              success:
                behavior !== "quota" &&
                (behavior !== "recover" || received.length > 1),
            }),
          },
          AI: {
            async run(_model, { messages }) {
              inferences++;
              if (behavior === "timeout")
                await new Promise<void>((resolve) =>
                  res.once("close", resolve),
                );
              if (behavior === "delayed")
                await new Promise<void>((resolve) => {
                  releaseInference = resolve;
                });
              if (behavior === "malformed") return { response: "broken JSON" };
              const { posts } = JSON.parse(messages[1]!.content) as {
                posts: (OnlineBatch["posts"][number] & { index: number })[];
              };
              return {
                response: JSON.stringify({
                  results: posts
                    .filter(
                      ({ index }) => behavior !== "partial" || index === 0,
                    )
                    .map(({ index, text }) => ({
                      index,
                      matches: text.includes("karena kamu tolol")
                        ? [
                            {
                              patternId: "ad-hominem",
                              matchedText: text
                                .split(" ")
                                .slice(0, 2)
                                .join(" "),
                              confidenceLevel: "possible",
                              explanation:
                                "Serangan pribadi dipakai untuk menolak argumen.",
                            },
                          ]
                        : [],
                    }))
                    .reverse(),
                }),
              };
            },
          },
        },
      );
      if (behavior === "recover" && reply.status === 429)
        reply.headers.set("Retry-After", "1");
      res.writeHead(reply.status, Object.fromEntries(reply.headers));
      res.end(await reply.text(), () => completed++);
    } catch {
      res.writeHead(500).end();
    }
  });
  server.listen(Number(new URL(origin!).port), "127.0.0.1");
  await once(server, "listening");
  stopServer = () =>
    new Promise<void>((resolve, reject) => {
      releaseInference?.();
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeAllConnections();
    });
});

let stopServer: (() => Promise<void>) | undefined;
test.afterEach(async () => {
  await stopServer?.();
  stopServer = undefined;
});

test("requires the initial Chrome grant before starting online requests", async ({
  playwright,
}) => {
  const directory = resolve(process.env.MD_ONLINE_E2E_UNGRANTED!);
  const context = await playwright.chromium.launchPersistentContext("", {
    channel: "chromium",
    args: [
      `--disable-extensions-except=${directory}`,
      `--load-extension=${directory}`,
    ],
  });
  try {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    const popup = await context.newPage();
    await popup.goto(new URL("/popup.html", worker.url()).href);
    const page = await openTimeline(context);
    await appendPosts(page, [{ id: "50000", text: "Rapat dimulai pukul 10." }]);
    await expect(popup.locator("#posts")).toHaveText("1");
    await expect(
      popup.getByRole("checkbox", { name: "Analisis online otomatis" }),
    ).not.toBeChecked();
    expect(received).toEqual([]);
  } finally {
    await context.close();
  }
});

test("ten visible posts use one request and one inference with no repeats on scrolling", async ({
  extensionContext,
  popup,
}) => {
  behavior = "delayed";
  const toggle = popup.getByRole("checkbox", {
    name: "Analisis online otomatis",
  });
  await expect(toggle).toBeChecked();
  await expect(toggle).toHaveAccessibleDescription(
    /teks unggahan yang terlihat dikirim/,
  );
  await expect(popup.locator("#online-state")).toContainText(
    "Mode online aktif",
  );
  const page = await openTimeline(extensionContext);
  await page.setViewportSize({ height: 1600, width: 1200 });
  await page.addStyleTag({ content: "body { min-height: 5000px; }" });
  const posts = Array.from({ length: 10 }, (_, index) => ({
    id: String(51000 + index),
    text: `Contoh ${index}: argumenmu ditolak karena kamu tolol. @aku https://x.com/u/status/123`,
  }));
  await appendPosts(page, [
    ...posts,
    { id: "51999", text: "Teks tersembunyi", kind: "hidden" },
  ]);
  await expect(
    page.locator(`${annotation}[data-analysis-status="loading"]`),
  ).toHaveCount(10);
  await expect.poll(() => inferences).toBe(1);
  releaseInference?.();
  expect(received).toHaveLength(1);
  expect(inferences).toBe(1);
  expect(received[0]?.posts).toHaveLength(10);
  expect(JSON.stringify(received)).not.toMatch(
    /@aku|https:\/\/x\.com|51000|tersembunyi/,
  );
  for (const [index, post] of posts.entries())
    await expect(
      page
        .locator(`[data-mock-id="${post.id}"] ${annotation}`)
        .locator("blockquote"),
    ).toHaveText(`Contoh ${index}:`);
  await expect(popup.locator("#posts")).toHaveText("10");
  await expect(popup.locator("#patterns")).toHaveText("10");
  expect(await storage(popup, "local")).toMatchObject({
    onlineUsage: { posts: 10, batches: 1 },
  });
  await page.evaluate(() => window.scrollTo(0, 3500));
  await page.evaluate(() => window.scrollTo(0, 0));
  await appendPosts(page, [posts[0]!]);
  await page
    .locator(`[data-mock-id="${posts[0]!.id}"]`)
    .last()
    .scrollIntoViewIfNeeded();
  await expect(page.locator(annotation)).toHaveCount(11);
  expect(received).toHaveLength(1);
  await expect(popup.locator("#posts")).toHaveText("10");
});

test("preserves an explicit local preference and shows a checkmark on a successful negative", async ({
  extensionContext,
  popup,
}) => {
  await expect(
    popup.getByRole("checkbox", { name: "Analisis online otomatis" }),
  ).toBeChecked();
  await popup.evaluate(async () => {
    const { settings } = await chrome.storage.local.get("settings");
    await chrome.storage.local.set({
      settings: { ...(settings as object), online: false },
    });
  });
  await popup.reload();
  await expect(
    popup.getByRole("checkbox", { name: "Analisis online otomatis" }),
  ).not.toBeChecked();
  const page = await openTimeline(extensionContext);
  await appendPosts(page, [{ id: "52000", text: "Rapat dimulai pukul 10." }]);
  await expect(popup.locator("#posts")).toHaveText("1");
  expect(received).toEqual([]);
  await popup
    .getByRole("checkbox", { name: "Analisis online otomatis" })
    .check();
  await page.bringToFront();
  await expect.poll(() => inferences).toBe(1);
  expect(received[0]?.posts).toEqual([{ text: "Rapat dimulai pukul 10." }]);
  const result = page.locator(`${annotation}[data-analysis-status="clear"]`);
  await expect(result).toContainText("Tidak ada pola terdeteksi");
  await expect(result).toContainText("✓");
  expect(
    await popup.evaluate(() => chrome.storage.session.get("onlineStatus")),
  ).toEqual({});
});

for (const scenario of ["quota", "malformed", "timeout"] as const) {
  test(`keeps the analyzed count at zero for ${scenario}`, async ({
    extensionContext,
    popup,
  }) => {
    behavior = scenario;
    await popup
      .getByRole("checkbox", { name: "Analisis online otomatis" })
      .check();
    const page = await openTimeline(extensionContext);
    await appendPosts(page, [
      { id: "53000", text: "Argumenmu ditolak karena kamu tolol." },
    ]);
    await expect(popup.locator("#online-state")).toContainText(
      scenario === "quota" ? "Kuota layanan" : "sedang tidak tersedia",
      { timeout: 16_000 },
    );
    await expect(
      page.locator(
        `${annotation}[data-analysis-status="${scenario === "quota" ? "quota" : "failed"}"]`,
      ),
    ).toContainText(
      scenario === "quota" ? "Menunggu kuota online" : "Analisis gagal",
    );
    await expect(popup.locator("#posts")).toHaveText("0");
    expect(received).toHaveLength(1);
    expect(inferences).toBe(scenario === "quota" ? 0 : 1);
  });
}

test("ignores an online result after same-tab navigation", async ({
  extensionContext,
  popup,
}) => {
  behavior = "delayed";
  await popup
    .getByRole("checkbox", { name: "Analisis online otomatis" })
    .check();
  const page = await openTimeline(extensionContext);
  await appendPosts(page, [
    { id: "54000", text: "Argumenmu ditolak karena kamu tolol." },
  ]);
  await expect.poll(() => inferences).toBe(1);
  await page.evaluate(() => history.pushState({}, "", "/explore"));
  releaseInference?.();
  await expect.poll(() => completed).toBe(1);
  await expect(page.locator(annotation)).toHaveCount(0);
  await expect(popup.locator("#posts")).toHaveText("0");
});

test("stops before sending a batch when the local daily limit is reached", async ({
  extensionContext,
  popup,
}) => {
  await popup.evaluate(() =>
    chrome.storage.local.set({
      onlineUsage: {
        day: Math.floor(Date.now() / 86_400_000),
        posts: 30,
        batches: 3,
      },
    }),
  );
  await popup
    .getByRole("checkbox", { name: "Analisis online otomatis" })
    .check();
  const page = await openTimeline(extensionContext);
  await appendPosts(page, [
    { id: "55000", text: "Argumenmu ditolak karena kamu tolol." },
  ]);
  await expect(popup.locator("#online-state")).toContainText(
    "Batas analisis harian",
  );
  await expect(popup.locator("#posts")).toHaveText("0");
  await expect(
    page.locator(`${annotation}[data-analysis-status="daily_limit"]`),
  ).toContainText("Kuota harian habis");
  expect(received).toEqual([]);
});

test("keeps all visible posts queued when more than two batches are present", async ({
  extensionContext,
  popup,
}) => {
  behavior = "delayed";
  const page = await openTimeline(extensionContext);
  await page.setViewportSize({ width: 1200, height: 3400 });
  await appendPosts(page, [
    { id: "56999", text: "Jadwal rapat tersedia di papan pengumuman." },
  ]);
  await expect.poll(() => inferences).toBe(1);
  await appendPosts(
    page,
    Array.from({ length: 20 }, (_, index) => ({
      id: String(57000 + index),
      text: "Jadwal rapat tersedia di papan pengumuman.",
    })),
  );
  await expect(
    page.locator(`${annotation}[data-analysis-status="loading"]`),
  ).toHaveCount(21);
  behavior = "normal";
  releaseInference?.();
  await expect(
    page.locator(`${annotation}[data-analysis-status="clear"]`),
  ).toHaveCount(21);
  await expect(popup.locator("#posts")).toHaveText("21");
  expect(received.map(({ posts }) => posts.length)).toEqual([1, 10, 10]);
  expect(inferences).toBe(3);
});

test("analyzes the posts that fit within the remaining daily quota", async ({
  extensionContext,
  popup,
}) => {
  await popup.evaluate(() =>
    chrome.storage.local.set({
      onlineUsage: {
        day: Math.floor(Date.now() / 86_400_000),
        posts: 28,
        batches: 10,
      },
    }),
  );
  await popup.evaluate(() =>
    chrome.storage.session.set({
      onlineStatus: { reason: "daily_limit", retryAt: Date.now() + 60_000 },
    }),
  );
  const page = await openTimeline(extensionContext);
  await appendPosts(
    page,
    Array.from({ length: 3 }, (_, index) => ({
      id: String(58000 + index),
      text: "Jadwal rapat tersedia di papan pengumuman.",
    })),
  );
  await expect(
    page.locator(`${annotation}[data-analysis-status="clear"]`),
  ).toHaveCount(2);
  await expect(
    page.locator(`${annotation}[data-analysis-status="daily_limit"]`),
  ).toHaveCount(1);
  await expect(popup.locator("#posts")).toHaveText("2");
  expect(received.map(({ posts }) => posts.length)).toEqual([2]);
});

test("automatically retries a visible post when a provider quota pause ends", async ({
  extensionContext,
  popup,
}) => {
  behavior = "recover";
  const page = await openTimeline(extensionContext);
  await appendPosts(page, [
    { id: "59000", text: "Jadwal rapat tersedia di papan pengumuman." },
  ]);
  await expect(
    page.locator(`${annotation}[data-analysis-status="quota"]`),
  ).toBeVisible();
  await expect(
    page.locator(`${annotation}[data-analysis-status="clear"]`),
  ).toBeVisible();
  await expect(popup.locator("#posts")).toHaveText("1");
  expect(received).toHaveLength(2);
  expect(inferences).toBe(1);
});

test("distinguishes a successful negative from a missing result on X search", async ({
  extensionContext,
  popup,
}) => {
  behavior = "partial";
  await popup
    .getByRole("checkbox", { name: "Analisis online otomatis" })
    .check();
  const page = await openTimeline(
    extensionContext,
    "/search?q=fixture-only-query",
  );
  await appendPosts(page, [
    { id: "56000", text: "Rapat dimulai pukul 10." },
    { id: "56001", text: "Pertemuan dilanjutkan besok." },
  ]);
  await expect(popup.locator("#online-state")).toContainText(
    "Sebagian unggahan",
  );
  await expect(popup.locator("#posts")).toHaveText("1");
  await expect(popup.locator("#patterns")).toHaveText("0");
  await expect(
    page.locator(
      `[data-mock-id="56000"] ${annotation}[data-analysis-status="clear"]`,
    ),
  ).toBeVisible();
  await expect(
    page.locator(
      `[data-mock-id="56001"] ${annotation}[data-analysis-status="failed"]`,
    ),
  ).toBeVisible();
  expect(received[0]?.posts).toHaveLength(2);
  expect(JSON.stringify(received)).not.toContain("fixture-only-query");
  expect(inferences).toBe(1);
});
