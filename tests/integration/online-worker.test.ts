import { expect, it, vi } from "vitest";
import {
  maskIdentifiers,
  toOnlineDetections,
  type OnlineBatch,
} from "../../src/online/protocol";
import { handleOnlineRequest, models } from "../../worker";

const batch: OnlineBatch = {
  categories: ["ad-hominem", "strawman"],
  posts: [
    { text: "Argumenmu tidak perlu didengar karena kamu tolol." },
    { text: "Semua menurutmu harus dilarang." },
  ],
};
const match = {
  patternId: "ad-hominem",
  confidenceLevel: "possible",
  matchedText: "karena kamu tolol",
  explanation: "Serangan pribadi menggantikan tanggapan atas argumen.",
} as const;
const env = (response: unknown) => ({
  LLM_MODEL: models[0],
  RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
  AI: {
    run: vi.fn(async () => ({
      choices: [{ message: { content: JSON.stringify(response) } }],
    })),
  },
});
function request(body: unknown = batch) {
  return new Request("https://example.com/v1/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

it("performs one inference for ten inputs and aligns independent results by index", async () => {
  const posts = Array.from({ length: 10 }, () => batch.posts[0]!);
  const results = posts
    .map((_, index) => ({ index, matches: index === 2 ? [match] : [] }))
    .reverse();
  const bindings = env({ results });
  const response = await handleOnlineRequest(
    request({ ...batch, posts }),
    bindings,
  );
  expect(bindings.AI.run).toHaveBeenCalledTimes(1);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({
    results: results.reverse().map((row) => row.matches),
  });
});

it("keeps invalid, duplicate and missing rows distinct from a valid negative result", async () => {
  const bindings = env({
    results: [
      { index: 0, matches: "malformed" },
      { index: 0, matches: [] },
      { index: 1, matches: [match] },
      { index: 3, matches: [] },
    ],
  });
  const response = await handleOnlineRequest(
    request({ ...batch, posts: [...batch.posts, ...batch.posts] }),
    bindings,
  );
  expect(await response.json()).toEqual({ results: [null, null, null, []] });
});

it("rejects unexpected metadata and over-sized batches before inference", async () => {
  const bindings = env({ results: [] });
  const oversized = {
    ...batch,
    posts: Array.from({ length: 11 }, () => batch.posts[0]),
  };
  const withMetadata = {
    ...batch,
    posts: [{ text: "Halo.", url: "https://x.com" }],
  };
  expect((await handleOnlineRequest(request(oversized), bindings)).status).toBe(
    400,
  );
  expect(
    (await handleOnlineRequest(request(withMetadata), bindings)).status,
  ).toBe(400);
  expect(bindings.AI.run).not.toHaveBeenCalled();
});

it("returns a bounded pause on a rate limit and a sanitized failure on malformed model output", async () => {
  const bindings = env({ bad: true });
  const failure = await handleOnlineRequest(request(), bindings);
  expect(failure.status).toBe(503);
  expect(await failure.json()).toEqual({ error: "unavailable" });
  bindings.RATE_LIMITER.limit.mockResolvedValue({ success: false });
  const limited = await handleOnlineRequest(request(), bindings);
  expect(limited.status).toBe(429);
  expect(limited.headers.get("Retry-After")).toBe("60");
  expect(bindings.AI.run).toHaveBeenCalledTimes(1);
});

it("keeps context-dependent suggestions qualitative and maps masked character offsets", () => {
  const original =
    "🥸 @akun bilang semuanya harus dilarang. https://x.com/akun/status/123";
  const text = maskIdentifiers(original);
  expect(text).not.toContain("akun");
  expect(text).not.toContain("https");
  const input = { categories: batch.categories, posts: [{ text }] };
  const detections = toOnlineDetections(input, 0, [
    { ...match, patternId: "strawman", matchedText: "semuanya harus dilarang" },
  ]);
  expect(detections?.[0]?.confidenceLevel).toBe("insufficient_context");
  expect(
    original.slice(detections?.[0]?.span.start, detections?.[0]?.span.end),
  ).toBe("semuanya harus dilarang");
});

it("keeps valid model evidence while normalizing stronger claims to possible", async () => {
  const bindings = env({
    results: [
      { index: 0, matches: [{ ...match, confidenceLevel: "certain" }] },
      { index: 1, matches: [] },
    ],
  });
  const response = await handleOnlineRequest(request(), bindings);
  expect(await response.json()).toEqual({ results: [[match], []] });
});
