import type { DetectionContext, PostInput } from "../models/post";
import {
  detectLanguage,
  normalizeText,
  segmentSentences,
} from "./text-normalizer";

const quotedText =
  /"[^"]+"|“[^”]+”|‘[^’]+’|«[^»]+»|(?<![\p{L}\p{N}])'[^'\n]+'(?![\p{L}\p{N}])/gu;
const illustration =
  /^(?:(?:ini|berikut(?: ini)?)\s+)?contoh\b|^(?:(?:an?\s+)?example of|for example,? an?\b)/u;
const attribution =
  /^(?:(?:dia|mereka|he|she|they)\s+(?:bilang|berkata|mengatakan|said|wrote)|katanya|(?:saya|aku|kami)\s+tidak\s+(?:pernah\s+)?(?:bilang|mengatakan)|(?:i|we)\s+(?:didn't|did not|never)\s+say)\b/u;
const explicitSatire =
  /(?:^|\s)(?:\/s|#satir(?:e)?|just kidding|cuma bercanda)[.!]?(?=\s|$)/u;
const satireMarkerOnly =
  /^(?:\/s|#satir(?:e)?|just kidding|cuma bercanda)[.!]?$/u;
const metaExample =
  /(?:ini|itu|kalimat (?:ini|itu))\s+(?:adalah\s+)?contoh\s+(?:ad hominem|dilema palsu|false dilemma|guilt tripping|tekanan rasa bersalah|banding pada otoritas|appeal to authority|pertanyaan bermuatan|loaded questions?|urgensi palsu|false urgency|whataboutism|strawman)\b|^(?:this|that)\s+is\s+an?\s+example of\b/u;

export function extractContext(post: PostInput): DetectionContext {
  // Keep UTF-16 offsets aligned even when a quotation spans several sentences.
  const withoutQuotes = post.text.replace(quotedText, (quote) =>
    " ".repeat(quote.length),
  );
  const segments = segmentSentences(post.text).map((span) => ({
    span,
    rulesText: normalizeText(withoutQuotes.slice(span.start, span.end)),
  }));
  const sentences = segments.map((sentence, index) => {
    const { rulesText } = sentence;
    const next = segments[index + 1]?.rulesText ?? "";
    const previous = segments[index - 1]?.rulesText ?? "";
    const isExample =
      illustration.test(rulesText) ||
      (previous.endsWith(":") && illustration.test(previous));
    if (
      isExample ||
      attribution.test(rulesText) ||
      explicitSatire.test(rulesText) ||
      satireMarkerOnly.test(next) ||
      metaExample.test(next)
    ) {
      return { ...sentence, rulesText: "" };
    }
    return sentence;
  });

  return {
    sentences,
    language: detectLanguage(
      segments.map(({ rulesText }) => rulesText).join(" "),
    ),
    relatedPosts: post.context ?? [],
  };
}
