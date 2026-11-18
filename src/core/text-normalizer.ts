import {
  englishCues,
  indonesianCues,
  informalWords,
} from "../data/linguistic-patterns";
import type { TextSpan } from "../models/detection-result";
import type { DetectionContext } from "../models/post";

const segmenter = new Intl.Segmenter("id", { granularity: "sentence" });
const word = /[\p{L}\p{M}\p{N}]+(?:'[\p{L}\p{M}\p{N}]+)*/gu;

export function segmentSentences(text: string): TextSpan[] {
  const spans: TextSpan[] = [];
  for (const { index, segment } of segmenter.segment(text)) {
    const start = segment.length - segment.trimStart().length;
    const end = segment.trimEnd().length;
    if (end > start) spans.push({ start: index + start, end: index + end });
  }
  return spans;
}

export function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’]/gu, "'")
    .replace(/https?:\/\/[^\s]+|@[\p{L}\p{N}_]+/gu, " ")
    .replace(word, (token) => informalWords.get(token) ?? token)
    .replace(/\s+/gu, " ")
    .trim();
}

export function detectLanguage(
  rulesText: string,
): DetectionContext["language"] {
  const words = rulesText.match(word) ?? [];
  const hasIndonesian = words.some((token) => indonesianCues.has(token));
  const hasEnglish = words.some((token) => englishCues.has(token));
  if (hasIndonesian && hasEnglish) return "mixed";
  if (hasIndonesian) return "id";
  if (hasEnglish) return "en";
  return "unknown";
}
