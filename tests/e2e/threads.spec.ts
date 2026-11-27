import { expect } from "@playwright/test";
import { test } from "../support/extension-fixture";
import { appendThreads, openThreads } from "../support/threads-timeline";
import { adHominemText, annotation } from "../support/x-timeline";

test("analyzes visible home posts, deduplicates rerenders, and follows a recycled card", async ({
  extensionContext,
  popup,
}) => {
  const page = await openThreads(extensionContext, "/for_you");
  await appendThreads(page, [
    { id: "post1", text: adHominemText },
    { id: "ignore1", text: adHominemText, kind: "reply" },
    { id: "ignore2", text: adHominemText, kind: "hidden" },
    { id: "ignore3", text: adHominemText, kind: "collapsed" },
    { id: "below", text: adHominemText, kind: "offscreen" },
  ]);
  await expect(popup.locator("#posts")).toHaveText("1");
  const card = page.locator('[data-mock-id="post1"]');
  const summary = card.locator(annotation).locator("summary");
  await summary.click();
  await expect(card.locator("blockquote")).toBeVisible();
  await expect(card).not.toHaveAttribute("data-row-clicks", "1");
  await card.getByRole("button", { name: "Like" }).click();
  await expect(card).toHaveAttribute("data-row-clicks", "1");
  await appendThreads(page, [{ id: "post1", text: adHominemText }]);
  await expect(popup.locator("#posts")).toHaveText("1");
  await card.first().evaluate((node) => {
    node
      .querySelector("a:has(time)")!
      .setAttribute("href", "/@fixture/post/recycled");
    node.querySelector(".x1a6qonq span")!.textContent =
      "Rapat dimulai pukul 10.";
  });
  await expect(card.first().locator(annotation)).toHaveCount(0);
  await expect(popup.locator("#posts")).toHaveText("2");
  await page.locator('[data-mock-id="below"]').scrollIntoViewIfNeeded();
  await expect(popup.locator("#posts")).toHaveText("3");
  await page.evaluate(() => {
    history.pushState({}, "", "/following/");
    document.querySelector('[aria-label="Column body"]')!.replaceChildren();
  });
  await appendThreads(page, [{ id: "following", text: adHominemText }]);
  await expect(
    page.locator('[data-mock-id="following"]').locator(annotation),
  ).toBeVisible();
});

test("accepts posts in search and selects only the permalink match on detail", async ({
  extensionContext,
  popup,
}) => {
  const page = await openThreads(
    extensionContext,
    "/search/?q=fixture&serp_type=default",
  );
  await appendThreads(page, [
    { id: "account", text: adHominemText, kind: "missing" },
    { id: "search", text: adHominemText },
  ]);
  await expect(page.locator(annotation)).toHaveCount(1);
  await popup.reload();
  await expect(popup.locator("#platform-name")).toContainText("Threads");
  await expect(popup.locator("#platform")).toHaveText("Deteksi aktif");

  await page.evaluate(() => {
    history.pushState({}, "", "/@fixture/post/detail/");
    document.querySelector('[aria-label="Column body"]')!.replaceChildren();
  });
  await appendThreads(page, [
    { id: "recommendation", text: adHominemText },
    {
      id: "detail",
      text: adHominemText,
      kind: "static",
      quote: "Periksa jadwal sebelum memutuskan.",
    },
    { id: "comment", text: adHominemText, kind: "reply" },
  ]);
  await expect(
    page.locator('[data-mock-id="detail"]').locator(annotation),
  ).toBeVisible();
  await expect(page.locator(annotation)).toHaveCount(1);
  await expect(popup.locator("#posts")).toHaveText("2");
});

test("uses an attached Threads quote as context without counting it as a post", async ({
  extensionContext,
  popup,
}) => {
  const page = await openThreads(extensionContext);
  const response =
    "Tidak usah bahas kritik itu. Pemerintahan sebelumnya juga menaikkan tarif.";
  await appendThreads(page, [
    {
      id: "quoteContext",
      text: response,
      quote: "Tarif bus naik dan merugikan penumpang.",
    },
  ]);
  const badge = page.locator(annotation);
  await badge.locator("summary").click();
  await expect(
    badge.getByRole("heading", { name: "Whataboutism" }),
  ).toBeVisible();
  await expect(badge.locator("blockquote")).toHaveText(response);
  await expect(popup.locator("#posts")).toHaveText("1");
});
