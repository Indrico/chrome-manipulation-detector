import type { LocatedPost, PlatformAdapter } from "../platform-adapter";
import type { PostContext, PostInput } from "../../models/post";
import { conversationPrefix, selectors, xOrigin } from "./selectors";

const homeTabs = new Set([
  "for you",
  "following",
  "untuk anda",
  "untukmu",
  "mengikuti",
]);
const searchTabs = new Set(["top", "latest", "populer", "teratas", "terbaru"]);
const translationLabels = new Set([
  "show translation",
  "hide translation",
  "translate post",
  "show original",
  "tampilkan terjemahan",
  "lihat terjemahan",
  "sembunyikan terjemahan",
  "terjemahkan postingan",
  "tampilkan teks asli",
  "lihat teks asli",
]);
const statusPath = /^(?:\/[a-z0-9_]{1,15}|\/i\/web)\/status\/(\d{1,25})\/?$/i;
const visibleReplyLabel = /^(?:replying to\b|membalas\b)/iu;
const postText = [selectors.text, selectors.conversationText].join(", ");
const feedCells = `${selectors.cell}, ${selectors.conversationCell}`;
const structural = [
  postText,
  selectors.reply,
  selectors.collapsed,
  selectors.quote,
  selectors.conversationTimestamp,
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

function supportsSearchLink(tab: HTMLAnchorElement) {
  if (!tab.hasAttribute("href")) return false;
  try {
    const url = new URL(tab.href);
    return isSearchPath(url.pathname) && supportsXSurface(url);
  } catch {
    return false;
  }
}

function ownedBy(element: Element, card: HTMLElement) {
  const quote = element.closest(selectors.quote);
  return (
    element.closest(selectors.card) === card && !(quote && card.contains(quote))
  );
}

function isRendered(element: HTMLElement): boolean {
  return (
    !element.closest('[hidden], [aria-hidden="true"]') &&
    (element.checkVisibility?.({
      opacityProperty: true,
      visibilityProperty: true,
    }) ??
      element.getClientRects().length > 0)
  );
}

function findAnnotationAnchor(card: HTMLElement, body: HTMLElement) {
  for (const control of card.querySelectorAll<HTMLElement>(
    selectors.translationControl,
  )) {
    const label = control.textContent.trim();
    if (
      ![control.getAttribute("aria-label"), label].some((name) =>
        translationLabels.has(name?.trim().toLowerCase() ?? ""),
      ) ||
      !ownedBy(control, card) ||
      body.contains(control) ||
      control.contains(body) ||
      !(
        control.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING
      ) ||
      !isRendered(control)
    )
      continue;

    // Use the translation branch beside the post text, outside the toolbar
    // even when it contains other controls such as translation settings.
    let row = control;
    while (row.parentElement && !row.parentElement.contains(body))
      row = row.parentElement;
    return row;
  }
  return body;
}

function findFeed(document: Document): HTMLElement | null {
  const url = document.location;
  if (!url || !supportsXSurface(url)) return null;
  const column = document.querySelector<HTMLElement>(selectors.column);
  const detailId = statusPath.exec(url.pathname)?.[1];
  if (detailId) {
    return (
      document.querySelector<HTMLElement>(
        `main section [id^="${conversationPrefix}${detailId}:"]`,
      ) ?? column
    );
  }
  const root = column ?? document.querySelector<HTMLElement>(selectors.main);
  if (!root) return null;
  const tabs = [
    ...root.querySelectorAll<HTMLElement>(selectors.selectedTab),
  ].filter((tab) => !tab.closest(selectors.secondary) && isRendered(tab));
  const tab = tabs.length === 1 ? tabs[0] : undefined;
  const labels = [tab?.getAttribute("aria-label"), tab?.textContent];
  const search = isSearchPath(url.pathname);
  const searchFeeds = search
    ? Array.from(
        root.querySelectorAll<HTMLElement>(selectors.semanticSearchFeed),
      ).filter((feed) => !feed.closest(selectors.secondary) && isRendered(feed))
    : [];
  const semanticSearch = searchFeeds.length === 1 ? searchFeeds[0] : undefined;
  const supportedTabs = search ? searchTabs : homeTabs;
  const supportedTab =
    semanticSearch && tab instanceof HTMLAnchorElement
      ? supportsSearchLink(tab)
      : labels.some((label) =>
          supportedTabs.has(
            label?.trim().replace(/\s+/gu, " ").toLowerCase() ?? "",
          ),
        );
  if (!supportedTab) return null;
  if (semanticSearch) return semanticSearch;

  const regions = [
    ...root.querySelectorAll<HTMLElement>(selectors.feed),
  ].filter(
    (region) =>
      !region.closest(selectors.secondary) &&
      (!region.parentElement?.closest(selectors.feed) ||
        !root.contains(region.parentElement.closest(selectors.feed))),
  );
  if (regions.length === 1) return regions[0] ?? null;
  const populated = regions.filter((region) => region.querySelector(feedCells));
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
    const cell = element.closest(feedCells);
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
    const changedDetailTextVisibility =
      statusPath.test(card.ownerDocument.location?.pathname ?? "") &&
      (element.matches(postText) || element.querySelector(postText));
    return element.querySelector(selectors.quote) || changedDetailTextVisibility
      ? [card]
      : [];
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

function isFeedCard(
  card: HTMLElement,
  feed: HTMLElement,
  cellSelector: string,
  cardSelector: string,
): boolean {
  const cell = card.closest(cellSelector);
  if (!cell || !feed.contains(cell)) return false;
  if (card.closest(selectors.secondary)) return false;
  const enclosingQuote = card.closest(selectors.quote);
  const navigationLink =
    cellSelector === selectors.conversationCell &&
    enclosingQuote?.matches(selectors.navigationLink) &&
    !card.closest(selectors.explicitQuote);
  if (enclosingQuote && cell.contains(enclosingQuote) && !navigationLink)
    return false;
  const topCards = [...cell.querySelectorAll<HTMLElement>(cardSelector)].filter(
    (candidate) => !candidate.parentElement?.closest(selectors.card),
  );
  return topCards.length === 1 && topCards[0] === card;
}

function locatePost(card: HTMLElement, feed: HTMLElement): LocatedPost | null {
  if (!feed.contains(card) || card.parentElement?.closest(selectors.card))
    return null;
  const statusInUrl = statusPath.exec(
    feed.ownerDocument.location?.pathname ?? "",
  )?.[1];
  const semanticDetail =
    !!statusInUrl && feed.id.startsWith(conversationPrefix);
  const legacyFeed =
    !statusInUrl &&
    isFeedCard(card, feed, selectors.cell, selectors.legacyCard);
  const semanticFeed =
    !statusInUrl &&
    !legacyFeed &&
    isFeedCard(card, feed, selectors.conversationCell, selectors.card);
  if (semanticDetail) {
    const cell = card.closest(selectors.conversationCell);
    if (cell?.parentElement?.parentElement !== feed) return null;
  } else if (statusInUrl) {
    if (!card.matches(selectors.legacyCard)) return null;
  } else if (!legacyFeed && !semanticFeed) {
    return null;
  }
  if (statusInUrl) {
    const enclosingQuote = card.closest(selectors.quote);
    if (enclosingQuote && feed.contains(enclosingQuote)) return null;
  }

  const own = <T extends HTMLElement>(selector: string) =>
    [...card.querySelectorAll<T>(selector)].filter((element) =>
      ownedBy(element, card),
    );
  if (own(selectors.collapsed).length) return null;

  const semantic = semanticDetail || semanticFeed;
  const textSelector = semantic ? selectors.conversationText : selectors.text;
  const timestamps = semantic
    ? own<HTMLAnchorElement>(selectors.conversationTimestamp)
    : own<HTMLTimeElement>("time").map((time) =>
        time.closest<HTMLAnchorElement>("a[href]"),
      );
  const links = timestamps
    .map((link) =>
      link && ownedBy(link, card) && !link.closest(textSelector)
        ? link
        : undefined,
    )
    .filter((link) => !semanticFeed || (link && statusId(link)));
  const anchor = statusInUrl
    ? links.find((link) => link && statusId(link) === statusInUrl)
    : links.length === 1
      ? links[0]
      : undefined;
  if (!anchor) return null;
  const id = statusId(anchor);
  if (!id) return null;

  const candidates = own(textSelector);
  const bodies =
    statusInUrl && candidates.length > 1
      ? candidates.filter(isRendered)
      : candidates;
  const body = bodies.length === 1 ? bodies[0] : undefined;
  if (!body) return null;

  // A reply can be the requested status on a detail page.
  if (!statusInUrl) {
    if (own(selectors.reply).length) return null;
    // Some X layouts place a plain-text reply label beside a profile link.
    const hasReplyLabel = own("div, span").some(
      (element) =>
        !element.closest(textSelector) &&
        visibleReplyLabel.test(element.firstChild?.nodeValue?.trim() ?? ""),
    );
    if (hasReplyLabel) return null;
  }

  return {
    id,
    card,
    body,
    annotationAnchor: findAnnotationAnchor(card, body),
    focusTarget: anchor,
  };
}

function readQuotedPost(post: LocatedPost): PostContext | undefined {
  const textSelector = post.body.matches(selectors.text)
    ? selectors.text
    : selectors.conversationText;
  const quotes = [
    ...post.card.querySelectorAll<HTMLElement>(selectors.quote),
  ].filter((quote) => {
    const parent = quote.parentElement;
    return (
      parent && ownedBy(parent, post.card) && quote.querySelector(textSelector)
    );
  });
  const quote = quotes.length === 1 ? quotes[0] : undefined;
  if (!quote || quote.querySelector(selectors.collapsed)) return;

  const bodies = quote.querySelectorAll<HTMLElement>(textSelector);
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
