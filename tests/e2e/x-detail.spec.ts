import { expect } from "@playwright/test";
import { storage, test } from "../support/extension-fixture";
import {
  adHominemText,
  annotation,
  appendPosts,
  openTimeline,
} from "../support/x-timeline";

test("shows the annotation below the translation control before a tall quote", async ({
  extensionContext,
  popup,
}) => {
  const page = await openTimeline(extensionContext, "/fixture/status/8001");
  await page.setViewportSize({ width: 520, height: 430 });
  await appendPosts(page, [{ id: "8001", text: adHominemText }]);
  const card = page.locator('article[data-testid="tweet"]');
  await card.evaluate((article) => {
    const body = article.querySelector('[data-testid="tweetText"]')!;
    const content = document.createElement("div");
    body.before(content);
    content.append(body);
    const quote = document.createElement("div");
    quote.dataset.testid = "quoteTweet";
    quote.style.height = "1000px";
    quote.textContent = "Kutipan dengan gambar tinggi";
    content.append(quote);
  });

  const badge = card.locator(annotation);
  await expect(badge).toBeInViewport({ ratio: 1 });
  await badge.locator("summary").click();
  await expect(badge.locator("blockquote")).toHaveText(adHominemText);
  await badge.locator("summary").focus();

  // X can render the translation control after the text is already visible.
  const body = card.locator('[data-testid="tweetText"]');
  await body.evaluate((text) => {
    const row = document.createElement("div");
    row.id = "translation-row";
    const button = document.createElement("button");
    button.textContent = "Show translation";
    button.addEventListener("click", () => {
      button.textContent = "Hide translation";
    });
    row.append(button);
    text.before(row);
  });

  await expect(
    card.locator(
      `#translation-row + ${annotation} + [data-testid="tweetText"]`,
    ),
  ).toHaveCount(1);
  await expect(badge.locator("summary")).toBeFocused();
  await expect(badge.locator("blockquote")).toBeInViewport();
  await card.getByRole("button", { name: "Show translation" }).click();
  await expect(
    card.getByRole("button", { name: "Hide translation" }),
  ).toBeVisible();
  await expect(page.locator(annotation)).toHaveCount(1);
  await expect(popup.locator("#posts")).toHaveText("1");
  await expect(popup.locator("#patterns")).toHaveText("1");
});

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
