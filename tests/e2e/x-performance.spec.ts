import { expect, type Page } from "@playwright/test";
import { cpus, platform, release } from "node:os";
import { test } from "../support/extension-fixture";
import {
  adHominemText,
  annotation,
  appendPosts,
  openTimeline,
} from "../support/x-timeline";

async function rendererHeap(page: Page) {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("HeapProfiler.collectGarbage");
    return (await session.send("Runtime.getHeapUsage")).usedSize;
  } finally {
    await session.detach();
  }
}

async function settlePaint(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

async function scrollWorkload(page: Page, enabled: boolean) {
  for (let round = 0; round < 3; round++) {
    const batch = Array.from({ length: 25 }, (_, index) => ({
      id: String(5000 + round * 25 + index),
      text: adHominemText,
    }));
    await appendPosts(page, batch);
    for (const post of batch.filter((_, index) => index % 5 === 0)) {
      const cell = page.locator(`[data-mock-id="${post.id}"]`);
      await cell.scrollIntoViewIfNeeded();
      if (enabled) await expect(cell.locator(annotation)).toBeVisible();
      else await settlePaint(page);
    }
    await page.locator("#timeline").evaluate((list) => list.replaceChildren());
    await settlePaint(page);
  }
}

test("records annotation latency and renderer heap on a controlled X fixture", async ({
  extensionContext,
  popup,
}) => {
  const toggle = popup.getByRole("checkbox", { name: "Aktifkan deteksi" });
  await toggle.uncheck();
  await expect(toggle).toBeEnabled();
  const disabled = await openTimeline(extensionContext);
  const disabledBefore = await rendererHeap(disabled);
  await scrollWorkload(disabled, false);
  const disabledAfter = await rendererHeap(disabled);
  await disabled.close();

  await toggle.check();
  await expect(toggle).toBeEnabled();
  const enabled = await openTimeline(extensionContext);
  const enabledBefore = await rendererHeap(enabled);
  await scrollWorkload(enabled, true);
  const enabledAfter = await rendererHeap(enabled);

  await appendPosts(enabled, [{ id: "6000", text: adHominemText }]);
  await expect(enabled.locator(annotation)).toBeVisible();
  const timings = await enabled.evaluate(async (annotationSelector) => {
    const list = document.querySelector("#timeline")!;
    const template = list.firstElementChild!.cloneNode(true) as HTMLElement;
    template.querySelector(annotationSelector)!.remove();
    const samples: number[] = [];
    for (let index = 0; index < 20; index++) {
      const card = template.cloneNode(true) as HTMLElement;
      card.querySelector("a")!.href = `/fixture/status/${6100 + index}`;
      const sample = await new Promise<number>((resolve) => {
        const start = performance.now();
        const observer = new MutationObserver(() => {
          if (card.querySelector(annotationSelector)) {
            observer.disconnect();
            resolve(performance.now() - start);
          }
        });
        observer.observe(list, { childList: true, subtree: true });
        list.replaceChildren(card);
      });
      samples.push(sample);
    }
    return samples.sort((a, b) => a - b);
  }, annotation);
  const percentile = (quantile: number) =>
    timings[Math.ceil(quantile * timings.length) - 1];
  console.log("Mock X baseline", {
    latencySamples: timings.length,
    medianMs: percentile(0.5),
    p95Ms: percentile(0.95),
    heapBytes: {
      disabled: { before: disabledBefore, after: disabledAfter },
      enabled: { before: enabledBefore, after: enabledAfter },
    },
    chromium: await enabled.evaluate(() => navigator.userAgent),
    os: `${platform()} ${release()}`,
    cpu: cpus()[0]?.model.trim(),
  });
});
