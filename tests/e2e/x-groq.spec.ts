import { expect, type Page } from "@playwright/test";
import { once } from "node:events";
import { createServer } from "node:http";
import type { browser } from "wxt/browser";
import { storage, test } from "../support/extension-fixture";
import {
  adHominemText,
  annotation,
  appendPosts,
  openTimeline,
} from "../support/x-timeline";

declare const chrome: typeof browser;
const origin = process.env.MD_GROQ_E2E_ORIGIN;
const fakeKey = "gsk_fixture_key_for_playwright";
test.skip(!origin, "Run npm run test:e2e:online -- --groq.");

type RequestRecord = {
  path: string | undefined;
  authorization: string | undefined;
  request: {
    model: string;
    messages: { role: string; content: string }[];
    response_format: {
      type: string;
      json_schema: {
        strict: boolean;
        schema: {
          required: string[];
          additionalProperties: boolean;
        };
      };
    };
  };
};

let calls: RequestRecord[];
let replyStatuses: number[];
let stopServer: () => void;
test.beforeEach(async () => {
  calls = [];
  replyStatuses = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const request = JSON.parse(Buffer.concat(chunks).toString());
    calls.push({
      path: req.url,
      authorization: req.headers.authorization,
      request,
    });
    const status = replyStatuses.shift() ?? 200;
    if (status !== 200) {
      res
        .writeHead(status, { "Retry-After": "2" })
        .end(
          JSON.stringify(
            status === 400 ? { error: { code: "json_validate_failed" } } : {},
          ),
        );
      return;
    }
    const { posts } = JSON.parse(request.messages[1].content) as {
      posts: { index: number; text: string }[];
    };
    const results = Object.fromEntries(
      [...posts].reverse().map(({ index, text }) => [
        `post_${index}`,
        text.includes(adHominemText)
          ? [
              {
                patternId: "ad-hominem",
                confidenceLevel: "possible",
                matchedText: adHominemText,
                explanation: "Kalimat menolak argumen lewat serangan pribadi.",
              },
            ]
          : [],
      ]),
    );
    res.writeHead(200, { "Content-Type": "application/json" }).end(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(results) } }],
      }),
    );
  });
  server.listen(Number(new URL(origin!).port), "127.0.0.1");
  await once(server, "listening");
  stopServer = () => {
    server.close();
    server.closeAllConnections();
  };
});

test.afterEach(() => stopServer());

async function connect(popup: Page, key = fakeKey) {
  const input = popup.getByLabel("API key Groq");
  await input.fill(key);
  await input.press("Enter");
  await expect(popup.getByRole("status")).toHaveText("API key Groq disimpan.");
  await expect(input).toHaveValue("");
}

async function storedKeyExists(popup: Page) {
  return popup.evaluate(
    () =>
      new Promise<boolean>((resolve, reject) => {
        const open = indexedDB.open("manipulation-detector-credentials", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const transaction = db.transaction("keys");
          const read = transaction.objectStore("keys").count("groq");
          transaction.oncomplete = () => {
            db.close();
            resolve(read.result === 1);
          };
          transaction.onabort = () => {
            db.close();
            reject(transaction.error);
          };
        };
      }),
  );
}

test("uses its own key once for ten visible posts despite the old pilot cap", async ({
  extensionContext,
  popup,
}) => {
  await popup.evaluate(async () => {
    const { settings } = await chrome.runtime.sendMessage({
      type: "settings:get",
    });
    await chrome.storage.local.set({
      settings: { ...settings, online: true },
      onlineUsage: {
        day: Math.floor(Date.now() / 86_400_000),
        posts: 30,
        batches: 10,
      },
    });
  });
  await popup.reload();
  const keyInput = popup.getByLabel("API key Groq");
  await expect(keyInput).toBeVisible();
  await keyInput.fill("invalid key");
  await keyInput.press("Enter");
  await expect(keyInput).toHaveAttribute("aria-invalid", "true");

  const page = await openTimeline(extensionContext, "/search?q=private-query");
  await page.setViewportSize({ height: 1800, width: 1200 });
  const posts = Array.from({ length: 10 }, (_, index) => ({
    id: String(61000 + index),
    text:
      index === 0
        ? adHominemText
        : `Rapat ${index} dimulai pukul 10. @akun https://x.com/u/status/1`,
  }));
  await appendPosts(page, posts);
  await expect(popup.locator("#posts")).toHaveText("10");
  expect(calls).toHaveLength(0);

  await connect(popup);
  await page.bringToFront();
  await expect(
    page.locator(`${annotation}[data-analysis-status="clear"]`),
  ).toHaveCount(9);
  await expect(page.locator(`${annotation} summary`)).toHaveText(
    "Indikasi Ad Hominem",
  );
  await expect(popup.locator("#posts")).toHaveText("10");
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    path: "/openai/v1/chat/completions",
    authorization: `Bearer ${fakeKey}`,
    request: {
      model: "openai/gpt-oss-20b",
      response_format: {
        type: "json_schema",
        json_schema: {
          strict: true,
          schema: {
            additionalProperties: false,
            required: Array.from({ length: 10 }, (_, index) => `post_${index}`),
          },
        },
      },
    },
  });
  const request = calls[0]!.request;
  expect(JSON.parse(request.messages[1]!.content).posts).toHaveLength(10);
  expect(JSON.stringify(request)).not.toMatch(
    /private-query|61000|@akun|https:\/\/x\.com|gsk_fixture/,
  );
  expect(JSON.stringify(await storage(popup, "local"))).not.toContain(fakeKey);
  expect(JSON.stringify(await storage(popup, "session"))).not.toContain(
    fakeKey,
  );
  await popup.reload();
  await expect(
    popup.getByRole("button", { name: "Putuskan Groq" }),
  ).toBeVisible();
  expect(await storedKeyExists(popup)).toBe(true);

  await popup.getByRole("button", { name: "Atur ulang pengaturan" }).click();
  await expect(keyInput).toBeVisible();
  expect(await storedKeyExists(popup)).toBe(false);
  await page.bringToFront();
  await appendPosts(page, [
    { id: "62000", text: "Rapat berikutnya hari Rabu." },
  ]);
  await expect(popup.locator("#posts")).toHaveText("11");
  expect(calls).toHaveLength(1);
});

test("labels local results while the account is rate limited and resumes online", async ({
  extensionContext,
  popup,
}) => {
  await connect(popup);
  replyStatuses.push(429);
  const page = await openTimeline(extensionContext);
  await appendPosts(page, [
    { id: "63000", text: adHominemText },
    { id: "63001", text: "Rapat dimulai pukul 10." },
  ]);
  await expect(page.locator(`${annotation} summary`)).toHaveText(
    "Analisis lokal · Indikasi Ad Hominem",
  );
  await expect(
    page.locator(`${annotation}[data-analysis-status="local_clear"]`),
  ).toBeVisible();
  await expect(popup.locator("#online-state")).toContainText("Kuota Groq");
  await expect(page.locator(`${annotation} summary`)).toHaveText(
    "Indikasi Ad Hominem",
  );
  await expect(
    page.locator(`${annotation}[data-analysis-status="clear"]`),
  ).toBeVisible();
  await expect(popup.locator("#posts")).toHaveText("2");
  expect(calls).toHaveLength(2);
});

test("stops sending after a rejected key and allows the user to replace it", async ({
  extensionContext,
  popup,
}) => {
  await connect(popup);
  replyStatuses.push(401);
  const page = await openTimeline(extensionContext);
  await appendPosts(page, [{ id: "64000", text: "Rapat dimulai pukul 10." }]);
  await expect(popup.locator("#online-state")).toContainText(
    "Groq menolak API key",
  );
  await appendPosts(page, [{ id: "64001", text: "Agenda tersedia." }]);
  await expect(
    page.locator(`${annotation}[data-analysis-status="local_clear"]`),
  ).toHaveCount(2);
  expect(calls).toHaveLength(1);
  await popup.getByRole("button", { name: "Putuskan Groq" }).click();
  await expect(popup.getByRole("status")).toHaveText("API key Groq dihapus.");
  expect(await storedKeyExists(popup)).toBe(false);

  const newKey = `${fakeKey}_replacement`;
  await connect(popup, newKey);
  await page.bringToFront();
  await expect(
    page.locator(`${annotation}[data-analysis-status="clear"]`),
  ).toHaveCount(2);
  expect(calls).toHaveLength(2);
  expect(calls[1]?.authorization).toBe(`Bearer ${newKey}`);
});

test("uses local detection for a Groq JSON validation error and sends the next batch", async ({
  extensionContext,
  popup,
}) => {
  await connect(popup);
  replyStatuses.push(400);
  const page = await openTimeline(extensionContext);
  await appendPosts(page, [
    { id: "65000", text: "Jadwal rapat tercantum di kalender." },
  ]);
  await expect(popup.locator("#online-state")).toContainText(
    "Hasil batch Groq gagal divalidasi",
  );
  await expect(
    page.locator(`${annotation}[data-analysis-status="local_clear"]`),
  ).toHaveCount(1);

  await appendPosts(page, [
    { id: "65001", text: "Pertemuan dimulai pukul 10." },
  ]);
  await expect(
    page.locator(`${annotation}[data-analysis-status="clear"]`),
  ).toHaveCount(1);
  await expect(popup.locator("#online-state")).toContainText(
    "Mode online aktif",
  );
  expect(calls).toHaveLength(2);
  expect(calls.map(({ request }) => request.messages[1]?.content)).toEqual([
    expect.stringContaining("Jadwal rapat"),
    expect.stringContaining("Pertemuan dimulai"),
  ]);
});
