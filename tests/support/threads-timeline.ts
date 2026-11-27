import type { BrowserContext, Page } from "@playwright/test";

const origin = "https://www.threads.com";
export async function openThreads(context: BrowserContext, path = "/") {
  const page = await context.newPage();
  await page.route(`${origin}/**`, (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: '<!doctype html><title>Threads</title><main><div role="region" aria-label="Column body"></div></main>',
    }),
  );
  await page.goto(`${origin}${path}`);
  await page.bringToFront();
  return page;
}

type ThreadsPost = {
  id: string;
  text: string;
  quote?: string;
  kind?:
    | "hidden"
    | "reply"
    | "missing"
    | "private"
    | "collapsed"
    | "offscreen"
    | "static";
};

export async function appendThreads(page: Page, posts: ThreadsPost[]) {
  await page.evaluate((posts) => {
    const region = document.querySelector('[aria-label="Column body"]')!;
    const fragment = document.createDocumentFragment();
    for (const { id, text, quote, kind } of posts) {
      const cell = document.createElement("div");
      cell.dataset.virtualized = "true";
      cell.dataset.mockId = id;
      if (kind === "hidden") cell.hidden = true;
      if (kind === "offscreen") cell.style.marginTop = "200vh";
      if (kind !== "static") cell.dataset.pressableContainer = "true";
      cell.innerHTML =
        '<div class="xrvj5dj xd0jker"><div><a href="/@fixture">Account</a><span dir="auto"><a><time>1h</time></a></span></div><div><div class="x1a6qonq"><div><span dir="auto"></span></div></div></div><div><button type="button">Like</button></div></div>';
      const header = cell.querySelector(".xrvj5dj > div")!;
      const link = cell.querySelector<HTMLAnchorElement>("a:has(time)")!;
      if (kind !== "missing") link.href = `/@fixture/post/${id}`;
      if (kind === "reply")
        header.setAttribute("aria-label", "Replying to @other");
      if (kind === "private")
        header.setAttribute("aria-label", "Private profile");
      const body = cell.querySelector(".x1a6qonq")!;
      body.querySelector("span")!.textContent = text;
      if (kind === "collapsed") {
        const expand = document.createElement("button");
        expand.textContent = "See more";
        body.append(expand);
      }
      if (quote) {
        const wrapper = document.createElement("blockquote");
        wrapper.innerHTML =
          '<a href="/@other/post/QuoteId"><time>2h</time></a><div class="x1a6qonq"><span dir="auto"></span></div>';
        wrapper.querySelector("span")!.textContent = quote;
        body.after(wrapper);
      }
      cell.addEventListener("click", () => {
        cell.dataset.rowClicks = String(
          Number(cell.dataset.rowClicks ?? 0) + 1,
        );
      });
      fragment.append(cell);
    }
    region.append(fragment);
  }, posts);
}
