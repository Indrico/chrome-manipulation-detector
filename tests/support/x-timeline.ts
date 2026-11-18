import { readFile } from "node:fs/promises";
import type { BrowserContext, Page } from "@playwright/test";

export const adHominemText =
  "Argumenmu tidak perlu didengar karena kamu tolol.";
export const doubleMatchText =
  "Kalau kamu tidak mendukung kebijakan ini, berarti kamu tidak peduli dengan negara.";
export const benignText = "Angka di tabel ini masih perlu diperiksa.";
export const annotation = "[data-manipulation-detector]";

export type MockPost = {
  id: string;
  text: string;
  kind?:
    "reply" | "plain-reply" | "truncated" | "quoted" | "ambiguous" | "hidden";
};

export async function openTimeline(context: BrowserContext, path = "/home") {
  const fixture = /^\/search\/?(?:[?#]|$)/.test(path)
    ? "x-search"
    : "x-timeline";
  const html = await readFile(`tests/fixtures/${fixture}.html`, "utf8");
  const page = await context.newPage();
  await page.route("https://x.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  await page.goto(`https://x.com${path}`);
  await page.bringToFront();
  return page;
}

export async function appendPosts(
  page: Page,
  posts: MockPost[],
  target = "#timeline",
) {
  await page.evaluate(
    ({ posts, target }) => {
      const container = document.querySelector(target)!;
      const fragment = document.createDocumentFragment();
      for (const { id, text, kind } of posts) {
        const cell = document.createElement("div");
        cell.dataset.testid = "cellInnerDiv";
        cell.dataset.mockId = id;
        cell.innerHTML =
          '<div><article data-testid="tweet" role="article"><div data-testid="User-Name"><a><time datetime="2026-11-18T00:00:00Z">1h</time></a></div><div data-testid="tweetText" lang="id" dir="auto"><span></span></div><div role="group"><button data-testid="like">Like</button></div></article></div>';
        const card = cell.querySelector("article")!;
        const link = card.querySelector("a")!;
        link.href = `/fixture/status/${id}`;
        const body = card.querySelector<HTMLDivElement>(
          '[data-testid="tweetText"]',
        )!;
        body.querySelector("span")!.textContent = text;
        card.querySelector("button")!.addEventListener("click", () => {
          card.dataset.likes = String(Number(card.dataset.likes ?? 0) + 1);
        });
        card.addEventListener("click", () => {
          card.dataset.clicks = String(Number(card.dataset.clicks ?? 0) + 1);
        });
        if (kind === "reply" || kind === "plain-reply") {
          const reply = document.createElement("div");
          if (kind === "reply") reply.dataset.testid = "replyingTo";
          reply.textContent = "Replying to ";
          const mention = document.createElement("a");
          mention.textContent = "@fixture";
          reply.append(mention);
          body.before(reply);
        } else if (kind === "truncated") {
          const showMore = document.createElement("button");
          showMore.dataset.testid = "tweet-text-show-more-link";
          showMore.textContent = "Show more";
          showMore.addEventListener("click", () => showMore.remove());
          body.after(showMore);
        } else if (kind === "quoted") {
          const quote = document.createElement("div");
          quote.setAttribute("role", "link");
          quote.innerHTML =
            '<div><a href="/other/status/99999"><time>1h</time></a><div data-testid="tweetText"></div></div>';
          quote.querySelector('[data-testid="tweetText"]')!.textContent = text;
          body.querySelector("span")!.textContent =
            "Berikut tulisan yang saya kutip.";
          body.after(quote);
        } else if (kind === "ambiguous") {
          body.after(body.cloneNode(true));
        } else if (kind === "hidden") {
          body.hidden = true;
        }
        fragment.append(cell);
      }
      container.append(fragment);
    },
    { posts, target },
  );
}
