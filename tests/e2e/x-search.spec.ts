import { expect, type Page } from "@playwright/test";
import { storage, test } from "../support/extension-fixture";
import {
  adHominemText,
  annotation,
  appendPosts,
  benignText,
  openTimeline,
} from "../support/x-timeline";

async function selectSearchTab(page: Page, name: string, path: string) {
  await page.evaluate(
    ({ name, path }) => {
      history.pushState({}, "", path);
      for (const tab of document.querySelectorAll('[role="tab"]')) {
        tab.setAttribute(
          "aria-selected",
          String(tab.textContent?.trim() === name),
        );
      }
    },
    { name, path },
  );
}

test("analyzes visible Top and Latest search posts while preserving session counts and privacy", async ({
  extensionContext,
  popup,
}) => {
  const page = await openTimeline(
    extensionContext,
    "/search/?q=kata-rahasia-fixture&src=typed_query",
  );
  await page.getByRole("searchbox", { name: "Search" }).fill(adHominemText);
  await appendPosts(page, [
    { id: "7101", text: adHominemText },
    { id: "7102", text: benignText },
    { id: "7103", text: adHominemText, kind: "reply" },
  ]);
  await appendPosts(page, [{ id: "7104", text: adHominemText }], "aside");
  const topBadge = page.locator('[data-mock-id="7101"]').locator(annotation);
  await expect(topBadge).toBeVisible();
  await expect(popup.locator("#posts")).toHaveText("2");
  await expect(page.locator(annotation)).toHaveCount(1);
  await popup.reload();
  await expect(popup.locator("#platform")).toHaveText("Deteksi aktif");

  await selectSearchTab(
    page,
    "Terbaru",
    "/search?q=kata-rahasia-fixture&f=live",
  );
  await page.locator("#timeline").evaluate((node) => node.replaceChildren());
  await appendPosts(page, [
    { id: "7101", text: adHominemText },
    { id: "7105", text: adHominemText },
  ]);
  await expect(
    page.locator('[data-mock-id="7105"]').locator(annotation),
  ).toBeVisible();
  await expect(popup.locator("#posts")).toHaveText("3");
  await expect(popup.locator("#patterns")).toHaveText("2");
  expect(await storage(popup, "local")).toEqual({});
  expect(await storage(popup, "session")).toEqual({
    sessionTotals: { posts: 3, patterns: 2 },
  });

  await page.evaluate(() =>
    history.pushState({}, "", "/search?q=kata-rahasia-fixture&f=user"),
  );
  await expect(page.locator(annotation)).toHaveCount(0);
  await selectSearchTab(
    page,
    "People",
    "/search?q=kata-rahasia-fixture&f=user",
  );
  await appendPosts(page, [{ id: "7106", text: adHominemText }]);
  await popup.reload();
  await expect(popup.locator("#platform")).toHaveText(
    "Buka beranda atau tab Top/Latest di pencarian X",
  );
  await expect(popup.locator("#posts")).toHaveText("3");
});

test("switches between home and search in one tab and ignores unsupported selected tabs", async ({
  extensionContext,
  popup,
}) => {
  const page = await openTimeline(extensionContext);
  await appendPosts(page, [{ id: "7201", text: adHominemText }]);
  const badge = page.locator(annotation);
  await expect(badge).toHaveCount(1);
  await expect(popup.locator("#posts")).toHaveText("1");

  await page.evaluate(() => {
    history.pushState({}, "", "/search?q=fixture");
    document.querySelector('[role="tab"][aria-selected="true"]')!.textContent =
      "Populer";
  });
  await appendPosts(page, [{ id: "7202", text: adHominemText }]);
  await expect(badge).toHaveCount(2);
  await expect(popup.locator("#posts")).toHaveText("2");

  await page.evaluate(() => {
    document.querySelector('[role="tab"][aria-selected="true"]')!.textContent =
      "Media";
  });
  await expect(badge).toHaveCount(0);
  await page.evaluate(() => {
    history.pushState({}, "", "/home");
    document.querySelector('[role="tab"][aria-selected="true"]')!.textContent =
      "For you";
  });
  await expect(badge).toHaveCount(2);
  await expect(popup.locator("#posts")).toHaveText("2");
});
