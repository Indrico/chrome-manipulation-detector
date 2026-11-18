import { extractContext } from "../core/context-extractor";
import type { DetectionContext } from "../models/post";

export function originalSentences({
  relatedPosts,
}: DetectionContext): string[] {
  const [original] = relatedPosts;
  if (relatedPosts.length !== 1 || !original) return [];
  return extractContext({ text: original.text })
    .sentences.map(({ rulesText }) => rulesText)
    .filter(Boolean);
}
