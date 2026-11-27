import type { LocatedPost, PlatformAdapter } from "../platform-adapter";
import type { PostContext, PostInput } from "../../models/post";
import { threadsOrigin, threadsSelectors as selectors } from "./selectors";

const postPath = /^\/@[\w.]+\/post\/([\w-]+)\/?$/u;
const replyText = /^(?:replying to|membalas(?: ke| kepada)?)\s+@/iu;
const expandText =
  /^(?:see more|show more|selengkapnya|lihat selengkapnya|tampilkan lebih banyak|baca selengkapnya)$/iu;

function route(location: Pick<Location, "origin" | "pathname" | "search">) {
  if (location.origin !== threadsOrigin) return;
  const path = location.pathname.replace(/\/$/u, "");
  if (!path || path === "/for_you" || path === "/following") return "feed";
  if (
    path === "/search" &&
    new URLSearchParams(location.search).get("q")?.trim()
  )
    return "search";
  if (postPath.test(path)) return "detail";
}

function postId(link: HTMLAnchorElement) {
  return link.origin === threadsOrigin
    ? postPath.exec(link.pathname)?.[1]
    : undefined;
}

function permalinks(root: ParentNode) {
  return [
    ...root.querySelectorAll<HTMLAnchorElement>(selectors.permalink),
  ].filter(
    (link) =>
      postId(link) &&
      !link.closest(`${selectors.hidden}, ${selectors.excluded}`),
  );
}

function rendered(element: HTMLElement) {
  return (
    !element.closest(selectors.hidden) &&
    !!element.getClientRects().length &&
    (!element.checkVisibility ||
      element.checkVisibility({
        opacityProperty: true,
        visibilityProperty: true,
      }))
  );
}

function findFeed(doc: Document) {
  const location = doc.location;
  if (!location) return null;
  const surface = route(location);
  if (!surface) return null;
  const detailId =
    surface === "detail" ? postPath.exec(location.pathname)?.[1] : undefined;
  const matching = (selector: string) => {
    const roots = [...doc.querySelectorAll<HTMLElement>(selector)].filter(
      (root) => rendered(root) && !root.closest(selectors.excluded),
    );
    const populated = roots.filter((root) =>
      permalinks(root).some((link) => !detailId || postId(link) === detailId),
    );
    return populated.filter(
      (root) =>
        !populated.some((nested) => nested !== root && root.contains(nested)),
    );
  };
  const columns = matching(selectors.column);
  if (columns.length) return columns.length === 1 ? columns[0]! : null;
  if (detailId) {
    const regions = matching(selectors.region);
    if (regions.length) return regions.length === 1 ? regions[0]! : null;
  }
  const empty = [...doc.querySelectorAll<HTMLElement>(selectors.column)].filter(
    (root) => rendered(root) && !root.closest(selectors.excluded),
  );
  return empty.length === 1 ? empty[0]! : null;
}

function postRow(link: HTMLAnchorElement) {
  const card = link.closest<HTMLElement>(selectors.card);
  const row = link.closest<HTMLElement>(selectors.row);
  return row && (!card || card.contains(row)) ? row : card;
}

function findCards(node: Node) {
  if (!(node instanceof Element)) return [];
  const descendant = permalinks(node);
  if (node instanceof HTMLAnchorElement && node.matches(selectors.permalink))
    descendant.push(node);
  const cards = descendant.flatMap((link) => postRow(link) ?? []);
  const enclosing = node.closest<HTMLElement>(
    `${selectors.row}, ${selectors.card}`,
  );
  if (enclosing && !cards.some((card) => enclosing.contains(card)))
    cards.push(enclosing);
  return [...new Set(cards)];
}

function changedCards(mutation: MutationRecord) {
  const node =
    mutation.target instanceof Element
      ? mutation.target
      : mutation.target.parentElement;
  const card = node?.closest<HTMLElement>(
    `${selectors.row}, ${selectors.card}`,
  );
  return card ? [card] : node?.matches(selectors.cell) ? findCards(node) : [];
}

function branchOf(row: Element, target: Element) {
  return [...row.children].find((child) => child.contains(target));
}

function sections(row: HTMLElement) {
  const first = permalinks(row).find((link) => postRow(link) === row);
  const header = first && branchOf(row, first);
  const content = header?.nextElementSibling;
  if (!first || !header || !(content instanceof HTMLElement)) return;
  const links = permalinks(header);
  if (links.length !== 1) return;
  return { header, content, permalink: first };
}

function quoteRoot(link: HTMLAnchorElement, content: HTMLElement) {
  const quote = link.parentElement?.closest<HTMLElement>(selectors.quote);
  return quote && quote !== content && content.contains(quote)
    ? quote
    : undefined;
}

function mainText(content: HTMLElement) {
  const nestedLinks = permalinks(content);
  const outsideQuotes = (body: HTMLElement) =>
    !body.closest(`${selectors.control}, ${selectors.hidden}`) &&
    !nestedLinks.some((link) => {
      const quote = quoteRoot(link, content);
      return quote
        ? quote.contains(body) || body.contains(quote)
        : branchOf(content, body) === branchOf(content, link);
    });
  const bodies = [
    ...content.querySelectorAll<HTMLElement>(selectors.text),
  ].filter(outsideQuotes);
  if (bodies.length === 1) return bodies[0];
  if (bodies.length) return;
  const candidates = [
    ...content.querySelectorAll<HTMLElement>(selectors.directional),
  ].filter(
    (body) =>
      outsideQuotes(body) &&
      !body.parentElement?.closest(selectors.directional) &&
      !body.closest("a") &&
      !!body.innerText.trim(),
  );
  return candidates.length === 1 ? candidates[0] : undefined;
}

function completeText(body: HTMLElement) {
  if (!rendered(body)) return "";
  const collapsed = [
    ...body.querySelectorAll<HTMLElement>(
      `${selectors.control}, a, [role="link"]`,
    ),
  ].some((control) => expandText.test(control.innerText.trim()));
  const text = body.innerText.trim();
  return collapsed || /(?:…|\.{3})$/u.test(text) ? "" : text;
}

function locatePost(card: HTMLElement, feed: HTMLElement): LocatedPost | null {
  if (!feed.contains(card) || card.closest(selectors.excluded)) return null;
  const parts = sections(card);
  if (!parts) return null;
  const { header, content, permalink } = parts;
  const id = postId(permalink);
  const current = card.ownerDocument.location;
  if (!id || !current) return null;
  const viewingDetail = route(current) === "detail";
  if (
    viewingDetail
      ? id !== postPath.exec(current.pathname)?.[1]
      : card.matches(selectors.reply) ||
        header.matches(selectors.reply) ||
        header.querySelector(selectors.reply) ||
        replyText.test(header.textContent?.trim() ?? "")
  )
    return null;
  const enclosing = card.parentElement?.closest<HTMLElement>(
    `${selectors.row}, article, [role="article"]`,
  );
  if (enclosing && sections(enclosing)?.content.contains(card)) return null;
  const cell = card.closest(selectors.cell);
  if (
    !viewingDetail &&
    cell &&
    permalinks(cell).some(
      (link) =>
        postRow(link) !== card &&
        !card.contains(link) &&
        !!(
          link.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING
        ),
    )
  )
    return null;
  const body = mainText(content);
  if (!body || !completeText(body)) return null;
  return { id, card, body, annotationAnchor: body, focusTarget: permalink };
}

function readQuote(
  content: HTMLElement,
  online: boolean,
): PostContext | undefined {
  const links = permalinks(content);
  if (links.length !== 1 || !links[0]) return;
  const quote = quoteRoot(links[0], content);
  if (!quote || (online && quote.closest(selectors.restricted))) return;
  const quoteBody = quote.querySelector<HTMLElement>(selectors.text);
  if (!quoteBody || quote.querySelectorAll(selectors.text).length !== 1) return;
  if (online) {
    const { top, bottom, left, right } = quoteBody.getBoundingClientRect();
    if (bottom <= 0 || top >= innerHeight || right <= 0 || left >= innerWidth)
      return;
  }
  const text = completeText(quoteBody);
  return text ? { source: "quoted_post", text } : undefined;
}

function readPost(
  post: LocatedPost,
  includeContext: boolean,
  online = false,
): PostInput {
  const text = completeText(post.body);
  const content =
    includeContext && text ? sections(post.card)?.content : undefined;
  const quote = content ? readQuote(content, online) : undefined;
  return quote ? { text, context: [quote] } : { text };
}

export const threadsAdapter: PlatformAdapter = {
  observedAttributes: [
    "aria-label",
    "data-visibility",
    "data-pressable-container",
  ],
  supports: (location) => !!route(location),
  findFeed,
  findCards,
  changedCards,
  locatePost,
  readPost,
  readOnlinePost(post, includeContext) {
    const scope = post.card.closest(selectors.cell) ?? post.card;
    if (
      !post.body.matches(selectors.text) ||
      scope.closest(selectors.restricted) ||
      scope.querySelector(selectors.restricted)
    )
      return;
    return readPost(post, includeContext, true);
  },
};
