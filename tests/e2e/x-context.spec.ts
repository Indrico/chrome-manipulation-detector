import { expect, type Locator } from "@playwright/test";
import { storage, test } from "../support/extension-fixture";
import { annotation, appendPosts, openTimeline } from "../support/x-timeline";

const original = "Batasi akses mobil pada akhir pekan.";
const representation =
  "Dia mau melarang semua akses mobil selamanya. Usulnya ngawur.";
const quoteBody = '[data-testid="tweetText"]';

async function appendQuote(card: Locator, text: string, hidden = false) {
  await card.evaluate(
    (article, quote) => {
      const wrapper = document.createElement("div");
      wrapper.setAttribute("role", "link");
      wrapper.dataset.mockQuote = "";
      wrapper.hidden = quote.hidden;
      wrapper.innerHTML =
        '<a href="/fixture/status/901"><time>1h</time></a><div data-testid="tweetText"></div>';
      wrapper.querySelector('[data-testid="tweetText"]')!.textContent =
        quote.text;
      article.append(wrapper);
    },
    { text, hidden },
  );
}

test("rechecks a changed Strawman quote and counts each primary revision and pattern once", async ({
  extensionContext,
  popup,
}) => {
  const feed = await openTimeline(extensionContext);
  await appendPosts(feed, [{ id: "90", text: representation }]);
  const cell = feed.locator('[data-mock-id="90"]');
  const card = cell.locator("article");
  const badge = cell.locator(annotation);
  await expect(popup.locator("#posts")).toHaveText("1");
  await expect(popup.locator("#patterns")).toHaveText("0");
  await expect(badge).toHaveCount(0);

  await appendQuote(card, original, true);
  const quote = card.locator("[data-mock-quote]");
  await expect(badge).toHaveCount(0);
  await quote.evaluate((node) => node.removeAttribute("hidden"));
  await expect(badge).toBeVisible();
  await expect(popup.locator("#patterns")).toHaveText("1");
  await badge.locator("summary").click();
  await expect(badge.getByRole("heading", { name: "Strawman" })).toBeVisible();
  await expect(badge.locator("blockquote")).toHaveText(representation);

  await quote.evaluate((node) => {
    node.classList.add("masked-quote");
    const style = document.createElement("style");
    style.textContent = ".masked-quote { visibility: hidden; }";
    document.head.append(style);
  });
  await expect(badge).toHaveCount(0);
  await quote.evaluate((node) => node.classList.remove("masked-quote"));
  await expect(badge).toBeVisible();

  await quote.evaluate((node) => {
    const more = document.createElement("button");
    more.dataset.testid = "tweet-text-show-more-link";
    more.textContent = "Show more";
    node.append(more);
  });
  await expect(badge).toHaveCount(0);
  await quote
    .getByRole("button", { name: "Show more" })
    .evaluate((node) => node.remove());
  await expect(badge).toBeVisible();

  await quote.evaluate((node) => {
    const duplicate = node.cloneNode(true) as HTMLElement;
    delete duplicate.dataset.mockQuote;
    duplicate.dataset.ambiguousQuote = "";
    node.after(duplicate);
  });
  await expect(badge).toHaveCount(0);
  await card
    .locator("[data-ambiguous-quote]")
    .evaluate((node) => node.remove());
  await expect(badge).toBeVisible();

  await quote.locator(quoteBody).evaluate((node) => {
    node.firstChild!.nodeValue = "Larang semua akses mobil selamanya.";
  });
  await expect(badge).toHaveCount(0);
  await quote.locator(quoteBody).evaluate((node, source) => {
    node.firstChild!.nodeValue = source;
  }, original);
  await expect(badge).toBeVisible();
  await quote.evaluate((node) => node.remove());
  await expect(badge).toHaveCount(0);

  await appendQuote(card, original);
  await expect(badge).toBeVisible();
  const toggle = popup.getByRole("checkbox", { name: "Strawman" });
  await toggle.uncheck();
  await expect(badge).toHaveCount(0);
  await toggle.check();
  await feed.bringToFront();
  await expect(badge).toBeVisible();
  expect(await storage(popup, "session")).toEqual({
    sessionTotals: { posts: 1, patterns: 1 },
  });
  expect(await storage(popup, "local")).toEqual({
    settings: {
      version: 1,
      enabled: true,
      showAnnotations: true,
      categories: { strawman: true },
    },
  });
});

test("attaches Whataboutism only to the response and drops it when criticism is replaced", async ({
  extensionContext,
  popup,
}) => {
  const feed = await openTimeline(extensionContext);
  const response =
    "Tidak usah bahas kritik itu. Pemerintahan sebelumnya juga menaikkan tarif.";
  await appendPosts(feed, [{ id: "91", text: response }]);
  const cell = feed.locator('[data-mock-id="91"]');
  const card = cell.locator("article");
  const badge = cell.locator(annotation);
  await appendQuote(card, "Tarif bus naik dan merugikan penumpang.");
  await expect(badge).toBeVisible();
  await badge.locator("summary").click();
  await expect(
    badge.getByRole("heading", { name: "Whataboutism" }),
  ).toBeVisible();
  await expect(badge.locator("blockquote")).toHaveText(response);
  await expect(popup.locator("#posts")).toHaveText("1");
  await expect(popup.locator("#patterns")).toHaveText("1");

  await card.locator("[data-mock-quote]").evaluate((quote) => {
    const replacement = quote.cloneNode(true) as HTMLElement;
    replacement.querySelector('[data-testid="tweetText"]')!.textContent =
      "Tarif bus diumumkan pada hari Jumat.";
    quote.replaceWith(replacement);
  });
  await expect(badge).toHaveCount(0);
  expect(await storage(popup, "session")).toEqual({
    sessionTotals: { posts: 1, patterns: 1 },
  });
});
