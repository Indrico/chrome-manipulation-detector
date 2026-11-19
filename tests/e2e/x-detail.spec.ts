import { expect } from "@playwright/test";
import { storage, test } from "../support/extension-fixture";
import {
  adHominemText,
  annotation,
  appendPosts,
  openTimeline,
} from "../support/x-timeline";

test("opens an annotation above the translation control even when the page cancels the click default", async ({
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
    content.style.pointerEvents = "none";
    body.before(content);
    content.append(body);
    article.addEventListener(
      "click",
      (event) => {
        if ((event.target as Element).matches("[data-manipulation-detector]"))
          event.preventDefault();
      },
      true,
    );
    const quote = document.createElement("div");
    quote.dataset.testid = "quoteTweet";
    quote.style.height = "1000px";
    quote.textContent = "Kutipan dengan gambar tinggi";
    content.append(quote);
  });

  const badge = card.locator(annotation);
  await expect(badge).toBeInViewport({ ratio: 1 });
  const trigger = badge.locator("summary");
  await trigger.click({ position: { x: 12, y: 12 } });
  await expect(badge.locator("blockquote")).toHaveText(adHominemText);
  await badge.locator("summary").focus();

  // X can render the translation control after the text is already visible.
  const body = card.locator('[data-testid="tweetText"]');
  await body.evaluate((text) => {
    const row = document.createElement("div");
    row.id = "translation-row";
    row.style.pointerEvents = "auto";
    const button = document.createElement("button");
    button.setAttribute("aria-label", "Show translation");
    button.textContent = "Terjemahan";
    button.addEventListener("click", () => {
      button.setAttribute("aria-label", "Hide translation");
    });
    row.append(button);
    text.before(row);
  });

  await expect(
    card.locator(
      `${annotation} + #translation-row + [data-testid="tweetText"]`,
    ),
  ).toHaveCount(1);
  await expect(badge.locator("summary")).toBeFocused();
  await expect(badge.locator("blockquote")).toBeInViewport();
  await card.getByRole("button", { name: "Show translation" }).click();
  await expect(
    card.getByRole("button", { name: "Hide translation" }),
  ).toBeVisible();
  await expect(trigger).toHaveText("Indikasi Ad Hominem");
  await trigger.click();
  await expect(badge.locator("blockquote")).toBeHidden();
  await trigger.press("Enter");
  await expect(badge.locator("blockquote")).toBeVisible();
  await expect(page.locator(annotation)).toHaveCount(1);
  await expect(popup.locator("#posts")).toHaveText("1");
  await expect(popup.locator("#patterns")).toHaveText("1");
});

test("places the annotation outside a clipped translation toolbar with a settings button", async ({
  extensionContext,
  popup,
}) => {
  const page = await openTimeline(extensionContext, "/fixture/status/8002");
  await appendPosts(page, [
    {
      id: "8002",
      text: "Udah besar, bukannya bantu orang tua malah merepotkan.",
    },
  ]);
  const card = page.locator('article[data-testid="tweet"]');
  await card.evaluate((article) => {
    const body = article.querySelector('[data-testid="tweetText"]')!;
    const toolbar = document.createElement("div");
    toolbar.id = "translation-toolbar";
    toolbar.style.cssText = "display:flex; height:24px; overflow:hidden";
    toolbar.innerHTML =
      '<div><button>Show translation</button></div><button aria-label="Translation settings"><svg width="12" height="12"><title>Settings</title></svg></button>';
    const settings = toolbar.querySelector(
      '[aria-label="Translation settings"]',
    )!;
    settings.addEventListener("click", () => {
      settings.setAttribute("aria-expanded", "true");
    });
    body.before(toolbar);
  });

  const badge = card.locator(annotation);
  await expect(popup.locator("#patterns")).toHaveText("1");
  await expect(badge.locator("summary")).toBeInViewport({ ratio: 1 });
  await expect(
    card.locator(`${annotation} + #translation-toolbar`),
  ).toHaveCount(1);
  await badge.getByText("Indikasi Tekanan rasa bersalah").click();
  await expect(badge.locator("blockquote")).toHaveText(
    "Udah besar, bukannya bantu orang tua malah merepotkan.",
  );
  const settings = card.getByRole("button", { name: "Translation settings" });
  await settings.click();
  await expect(settings).toHaveAttribute("aria-expanded", "true");
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

test("finds the main post among extra timestamps and hidden copies of the text", async ({
  extensionContext,
  popup,
}) => {
  const page = await openTimeline(extensionContext, "/fixture/status/8152");
  await appendPosts(page, [
    { id: "8151", text: adHominemText, kind: "reply" },
    {
      id: "8152",
      text: "Udah gede, bukannya bantu ibu malah nyusahin.",
    },
  ]);
  const related = page.locator('[data-mock-id="8151"]');
  await related.evaluate((cell) => {
    const body = cell.querySelector('[data-testid="tweetText"]')!;
    body.innerHTML += ' <a href="/fixture/status/8152"><time>1j</time></a>';
  });
  const primary = page.locator('[data-mock-id="8152"]');
  await primary.evaluate((cell) => {
    const body = cell.querySelector('[data-testid="tweetText"]')!;
    const hiddenCopy = body.cloneNode(true) as HTMLElement;
    hiddenCopy.id = "translation-copy";
    hiddenCopy.style.display = "none";
    hiddenCopy.textContent = "The translated text is hidden.";
    const extraTimestamp = document.createElement("a");
    extraTimestamp.href = "/fixture/status/8153";
    extraTimestamp.innerHTML = "<time>1j</time>";
    body.before(hiddenCopy, extraTimestamp);
  });

  await expect(primary.locator(annotation).locator("summary")).toHaveText(
    "Indikasi Tekanan rasa bersalah",
  );
  await expect(related.locator(annotation)).toHaveCount(0);
  await expect(popup.locator("#posts")).toHaveText("1");
  await expect(popup.locator("#patterns")).toHaveText("1");

  const translation = primary.locator("#translation-copy");
  await translation.evaluate((node) => (node.style.display = ""));
  await expect(primary.locator(annotation)).toHaveCount(0);
  await translation.evaluate((node) => (node.style.display = "none"));
  await expect(primary.locator(annotation)).toBeVisible();
  await expect(popup.locator("#posts")).toHaveText("1");
  await expect(popup.locator("#patterns")).toHaveText("1");
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
