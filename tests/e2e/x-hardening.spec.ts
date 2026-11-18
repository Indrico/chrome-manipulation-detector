import { expect } from "@playwright/test";
import { storage, test } from "../support/extension-fixture";
import {
  adHominemText,
  annotation,
  appendPosts,
  openTimeline,
} from "../support/x-timeline";

test("renders excerpts as text and accepts feedback and dismissal from user actions", async ({
  extensionContext,
  popup,
}) => {
  const outbound: string[] = [];
  await extensionContext.route(/^https?:\/\//, async (route) => {
    outbound.push(new URL(route.request().url()).origin);
    await route.abort();
  });
  const page = await openTimeline(extensionContext);
  const text =
    "Argumenmu tidak perlu didengar karena kamu tolol <b>contoh</b>.";
  await appendPosts(page, [{ id: "3001", text }]);
  const badge = page.locator(annotation);
  await badge.locator("summary").press("Enter");
  await expect(badge.locator("blockquote")).toHaveText(text);
  await expect(badge.locator("blockquote b")).toHaveCount(0);

  await badge.getByRole("combobox").selectOption("helpful");
  const save = badge.getByRole("button", { name: "Simpan" });
  await save.dispatchEvent("click");
  await badge
    .getByRole("button", { name: "Tutup anotasi" })
    .dispatchEvent("click");
  await expect(badge).toBeVisible();
  await save.press("Space");
  await expect(badge.getByRole("status")).toHaveText(
    "Umpan balik disimpan di perangkat.",
  );
  await expect(save).toBeFocused();
  expect(await storage(popup, "local")).toEqual({
    feedback: [{ patternId: "ad-hominem", reason: "helpful", count: 1 }],
  });
  await expect(popup.locator("#posts")).toHaveText("1");
  expect(await storage(popup, "session")).toEqual({
    sessionTotals: { posts: 1, patterns: 1 },
  });
  expect(outbound).toEqual([]);
});

test("preserves an open disclosure and returns focus to its post after an update", async ({
  extensionContext,
}) => {
  const page = await openTimeline(extensionContext);
  await appendPosts(page, [{ id: "3002", text: adHominemText }]);
  const badge = page.locator(annotation);
  await badge.locator("summary").press("Enter");
  await badge.getByRole("combobox").focus();
  await expect(badge.getByRole("combobox")).toBeFocused();
  const newText = "Pendapatmu tidak perlu didengar karena kamu bodoh.";
  await page
    .locator('[data-testid="tweetText"] span')
    .evaluate((node, text) => {
      node.textContent = text;
    }, newText);
  await expect(badge.locator("blockquote")).toBeVisible();
  await expect(badge.locator("blockquote")).toHaveText(newText);
  await expect(page.locator('a[href="/fixture/status/3002"]')).toBeFocused();
});

test("keeps session counts and annotation cleanup consistent when recycling 600 posts", async ({
  extensionContext,
  popup,
}) => {
  test.setTimeout(60_000);
  const page = await openTimeline(extensionContext);
  await page.setViewportSize({ width: 1280, height: 900 });
  await appendPosts(
    page,
    Array.from({ length: 6 }, (_, index) => ({
      id: String(10000 + index),
      text: adHominemText,
    })),
  );
  await expect(page.locator(annotation)).toHaveCount(6);
  await page.evaluate(async (annotationSelector) => {
    const list = document.querySelector("#timeline")!;
    const links = [
      ...list.querySelectorAll<HTMLAnchorElement>("article a[href]"),
    ];
    async function recycle(firstId: number, targets: HTMLAnchorElement[]) {
      const old = new Set(list.querySelectorAll(annotationSelector));
      await new Promise<void>((resolve) => {
        const observer = new MutationObserver(() => {
          const current = [...list.querySelectorAll(annotationSelector)];
          if (
            current.length === links.length &&
            current.filter((node) => !old.has(node)).length >= targets.length
          ) {
            observer.disconnect();
            resolve();
          }
        });
        observer.observe(list, { childList: true, subtree: true });
        targets.forEach((link, index) => {
          link.href = `/fixture/status/${firstId + index}`;
        });
      });
    }
    for (let index = 6; index < 600; index += 6)
      await recycle(10000 + index, links);
    await recycle(10588, links.slice(0, 1));
    await recycle(10000, links.slice(0, 1));
  }, annotation);
  await expect(popup.locator("#posts")).toHaveText("601");
  await expect(popup.locator("#patterns")).toHaveText("601");

  const enabled = popup.getByRole("checkbox", { name: "Aktifkan deteksi" });
  await enabled.uncheck();
  await expect(page.locator(annotation)).toHaveCount(0);
  await page.evaluate(() => history.pushState({}, "", "/explore"));
  await enabled.check();
  await page.bringToFront();
  await expect(page.locator(annotation)).toHaveCount(0);
  await expect(popup.locator("#posts")).toHaveText("601");
  await page.evaluate(() => history.pushState({}, "", "/home"));
  await expect(page.locator(annotation)).toHaveCount(6);
  await expect(popup.locator("#posts")).toHaveText("601");
});
