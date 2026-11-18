import type { LocatedPost, PlatformAdapter } from "../platform-adapter";
import type { PostContext, PostInput } from "../../models/post";
import { selectors, xOrigin } from "./selectors";

const homeTabs = new Set([
  "for you",
  "following",
  "untuk anda",
  "untukmu",
  "mengikuti",
]);
const searchTabs = new Set(["top", "latest", "populer", "teratas", "terbaru"]);
const statusPath = /^(?:\/[a-z0-9_]{1,15}|\/i\/web)\/status\/(\d{1,25})\/?$/i;
const visibleReplyLabel = /^(?:replying to\b|membalas\b)/iu;
const structural = [
  selectors.text,
  selectors.reply,
  selectors.collapsed,
  selectors.quote,
  "time",
].join(", ");

function statusId(anchor: HTMLAnchorElement) {
  try {
    const url = new URL(anchor.href);
    return url.origin === xOrigin
      ? statusPath.exec(url.pathname)?.[1]
      : undefined;
  } catch {
    return undefined;
  }
}

function isSearchPath(pathname: string): boolean {
  return pathname === "/search" || pathname === "/search/";
}

function supportsXSurface(
  url: Pick<Location, "origin" | "pathname" | "search">,
): boolean {
  if (url.origin !== xOrigin) return false;
  if (url.pathname === "/home" || url.pathname === "/home/") return true;
  if (statusPath.test(url.pathname)) return true;
  if (!isSearchPath(url.pathname)) return false;
  const filter = new URLSearchParams(url.search).get("f");
  return !filter || filter === "top" || filter === "live";
}

function ownedBy(element: Element, card: HTMLElement) {
  const quote = element.closest(selectors.quote);
  return (
    element.closest(selectors.card) === card && !(quote && card.contains(quote))
  );
}

function findFeed(document: Document): HTMLElement | null {
  const url = document.location;
  if (!url || !supportsXSurface(url)) return null;
  const column = document.querySelector<HTMLElement>(selectors.column);
  if (!column) return null;
  if (statusPath.test(url.pathname)) return column;
  const tabs = column.querySelectorAll(selectors.selectedTab);
  const tab = tabs.length === 1 ? tabs[0] : undefined;
  const labels = [tab?.getAttribute("aria-label"), tab?.textContent];
  const supportedTabs = isSearchPath(url.pathname) ? searchTabs : homeTabs;
  if (
    !labels.some((label) =>
      supportedTabs.has(label?.trim().toLowerCase() ?? ""),
    )
  )
    return null;

  const regions = [
    ...column.querySelectorAll<HTMLElement>(selectors.feed),
  ].filter(
    (region) =>
      !region.parentElement?.closest(selectors.feed) ||
      !column.contains(region.parentElement.closest(selectors.feed)),
  );
  if (regions.length === 1) return regions[0] ?? null;
  const populated = regions.filter((region) =>
    region.querySelector(selectors.cell),
  );
  return populated.length === 1 ? (populated[0] ?? null) : null;
}

function findCards(node: Node): HTMLElement[] {
  if (!(node instanceof HTMLElement)) return [];
  const cards = [...node.querySelectorAll<HTMLElement>(selectors.card)];
  if (node.matches(selectors.card)) cards.unshift(node);
  return cards;
}

function changedCards(mutation: MutationRecord): HTMLElement[] {
  const element =
    mutation.target instanceof Element
      ? mutation.target
      : mutation.target.parentElement;
  const closestCard = element?.closest<HTMLElement>(selectors.card);
  const card =
    closestCard?.parentElement?.closest<HTMLElement>(selectors.card) ??
    closestCard;
  if (!element) return [];
  const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];
  if (!card) {
    const cell = element.closest(selectors.cell);
    return cell && changedNodes.some((node) => findCards(node).length > 0)
      ? findCards(cell)
      : [];
  }
  const quote = element.closest(selectors.quote);
  if (quote && card.contains(quote)) return [card];
  if (!ownedBy(element, card)) return [];
  if (
    mutation.type === "attributes" &&
    (mutation.attributeName === "style" || mutation.attributeName === "class")
  ) {
    return element.querySelector(selectors.quote) ? [card] : [];
  }
  if (
    element === card ||
    element.closest(structural) ||
    (mutation.type === "attributes" && element.querySelector(structural)) ||
    changedNodes.some(
      (node) =>
        node instanceof Element &&
        (node.matches(structural) || node.querySelector(structural)),
    ) ||
    visibleReplyLabel.test(element.firstChild?.nodeValue?.trim() ?? "") ||
    visibleReplyLabel.test(mutation.oldValue?.trim() ?? "")
  )
    return [card];
  return [];
}

function isFeedCard(card: HTMLElement, feed: HTMLElement): boolean {
  const cell = card.closest(selectors.cell);
  if (!cell || !feed.contains(cell)) return false;
  const enclosingQuote = card.closest(selectors.quote);
  if (enclosingQuote && cell.contains(enclosingQuote)) return false;
  const topCards = [
    ...cell.querySelectorAll<HTMLElement>(selectors.card),
  ].filter((candidate) => !candidate.parentElement?.closest(selectors.card));
  return topCards.length === 1 && topCards[0] === card;
}

function locatePost(card: HTMLElement, feed: HTMLElement): LocatedPost | null {
  if (!feed.contains(card) || card.parentElement?.closest(selectors.card))
    return null;
  const statusInUrl = statusPath.exec(
    feed.ownerDocument.location?.pathname ?? "",
  )?.[1];
  if (statusInUrl) {
    const enclosingQuote = card.closest(selectors.quote);
    if (enclosingQuote && feed.contains(enclosingQuote)) return null;
  } else if (!isFeedCard(card, feed)) {
    return null;
  }

  const own = <T extends HTMLElement>(selector: string) =>
    [...card.querySelectorAll<T>(selector)].filter((element) =>
      ownedBy(element, card),
    );
  if (own(selectors.collapsed).length) return null;

  const times = own<HTMLTimeElement>("time");
  const anchor =
    times.length === 1
      ? times[0]?.closest<HTMLAnchorElement>("a[href]")
      : undefined;
  if (!anchor || !ownedBy(anchor, card)) return null;
  const id = statusId(anchor);
  if (!id || (statusInUrl && id !== statusInUrl)) return null;

  const bodies = own(selectors.text);
  const body = bodies.length === 1 ? bodies[0] : undefined;
  if (!body) return null;

  // A reply can be the requested status on a detail page.
  if (statusInUrl) return { id, card, body, focusTarget: anchor };
  if (own(selectors.reply).length) return null;
  // Some X layouts render the reply label as plain text beside a profile link.
  const socialLabels = own("div, span").filter(
    (element) =>
      element.firstChild?.nodeType === Node.TEXT_NODE &&
      !element.closest(selectors.text),
  );
  if (
    socialLabels.some((element) =>
      visibleReplyLabel.test(element.firstChild?.nodeValue?.trim() ?? ""),
    )
  )
    return null;

  return { id, card, body, focusTarget: anchor };
}

function readQuotedPost(post: LocatedPost): PostContext | undefined {
  const quotes = [
    ...post.card.querySelectorAll<HTMLElement>(selectors.quote),
  ].filter((quote) => {
    const parent = quote.parentElement;
    return (
      parent &&
      ownedBy(parent, post.card) &&
      quote.querySelector(selectors.text)
    );
  });
  const quote = quotes.length === 1 ? quotes[0] : undefined;
  if (!quote || quote.querySelector(selectors.collapsed)) return;

  const bodies = quote.querySelectorAll<HTMLElement>(selectors.text);
  const body = bodies.length === 1 ? bodies[0] : undefined;
  if (!body || body.closest('[hidden], [aria-hidden="true"]')) return;

  if (!quote.matches(selectors.explicitQuote)) {
    const times = quote.querySelectorAll("time");
    const anchor =
      times.length === 1
        ? times[0]?.closest<HTMLAnchorElement>("a[href]")
        : undefined;
    const quotedId = anchor && statusId(anchor);
    if (!quotedId || quotedId === post.id) return;
  }
  if (
    !body.getClientRects().length ||
    (body.checkVisibility &&
      !body.checkVisibility({
        opacityProperty: true,
        visibilityProperty: true,
      }))
  )
    return;
  for (
    let node: HTMLElement | null = body;
    node && quote.contains(node);
    node = node.parentElement
  ) {
    const style = getComputedStyle(node);
    const clipsText =
      Number.parseInt(style.webkitLineClamp, 10) > 0 ||
      style.overflowY === "hidden";
    if (clipsText && node.scrollHeight > node.clientHeight + 1) return;
  }

  const text = body.innerText.trim();
  if (text && !/(?:…|\.{3})$/u.test(text))
    return { source: "quoted_post", text };
}

function readPost(post: LocatedPost, includeContext: boolean): PostInput {
  const text = post.body.innerText.trim();
  const quote = includeContext && text ? readQuotedPost(post) : undefined;
  return quote ? { text, context: [quote] } : { text };
}

export const xAdapter: PlatformAdapter = {
  supports: supportsXSurface,
  findFeed,
  findCards,
  changedCards,
  locatePost,
  readPost,
};
