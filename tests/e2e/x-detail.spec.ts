import { expect } from "@playwright/test";
import { storage, test } from "../support/extension-fixture";
import {
  adHominemText,
  annotation,
  appendPosts,
  openTimeline,
} from "../support/x-timeline";

test("analyzes the main status by the URL ID and skips surrounding replies", async ({
  extensionContext,
  popup,
}) => {
  const page = await openTimeline(
    extensionContext,
    "/fixture/status/8102?s=20",
  );
  await appendPosts(page, [
    { id: "8101", text: adHominemText },
    {
      id: "8102",
      text: "Udah dewasa, bukannya bantu ayah malah jadi beban.",
      kind: "reply",
    },
    { id: "8103", text: adHominemText, kind: "reply" },
  ]);
  const primary = page.locator('[data-mock-id="8102"]');
  await primary.evaluate((cell) => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-mock-id", "8102");
    wrapper.append(cell.querySelector("article")!);
    cell.replaceWith(wrapper);
  });

  const badge = primary.locator(annotation);
  await badge.locator("summary").press("Enter");
  await expect(
    badge.getByRole("heading", { name: "Tekanan rasa bersalah" }),
  ).toBeVisible();
  await expect(page.locator(annotation)).toHaveCount(1);
  await expect(popup.locator("#posts")).toHaveText("1");
  await expect(popup.locator("#patterns")).toHaveText("1");
  expect(await storage(popup, "local")).toEqual({});
});

test("switches the annotated status when the URL changes in the same primary column", async ({
  extensionContext,
  popup,
}) => {
  const page = await openTimeline(extensionContext, "/fixture/status/8201");
  await appendPosts(page, [
    { id: "8201", text: adHominemText },
    { id: "8202", text: adHominemText },
  ]);
  const first = page.locator('[data-mock-id="8201"]').locator(annotation);
  const second = page.locator('[data-mock-id="8202"]').locator(annotation);
  await expect(first).toBeVisible();
  await expect(second).toHaveCount(0);
  await expect(popup.locator("#posts")).toHaveText("1");

  await page.evaluate(() => history.pushState({}, "", "/i/web/status/8202"));
  await expect(second).toBeVisible();
  await expect(first).toHaveCount(0);
  await expect(popup.locator("#posts")).toHaveText("2");

  await page.evaluate(() => history.back());
  await expect(first).toBeVisible();
  await expect(second).toHaveCount(0);
  await expect(popup.locator("#posts")).toHaveText("2");
  await expect(popup.locator("#patterns")).toHaveText("2");
});
