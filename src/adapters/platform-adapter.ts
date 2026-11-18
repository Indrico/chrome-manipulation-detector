export interface LocatedPost {
  readonly id: string;
  readonly card: HTMLElement;
  readonly body: HTMLElement;
  readonly focusTarget: HTMLElement;
}

export interface PlatformAdapter {
  supports(url: Pick<Location, "origin" | "pathname">): boolean;
  findFeed(document: Document): HTMLElement | null;
  findCards(node: Node): HTMLElement[];
  changedCards(mutation: MutationRecord): HTMLElement[];
  locatePost(card: HTMLElement, feed: HTMLElement): LocatedPost | null;
  readPost(post: LocatedPost, includeContext: boolean): PostInput;
}
import type { PostInput } from "../models/post";
