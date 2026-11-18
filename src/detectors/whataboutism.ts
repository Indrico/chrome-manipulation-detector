import type { Detector } from "../models/detector";
import { originalSentences } from "./original-context";

const refusal =
  /^(?:(?:(?:tidak (?:usah|perlu)|jangan) (?:bahas|membahas|jawab|menjawab)) (?:kritik|masalah) (?:itu|ini)|(?:(?:don't|do not) (?:address|answer|discuss)|ignore) (?:that|this|the) criticism)\b/u;
const challengesCritique =
  /^(?:(?:kenapa|mengapa) (?:kamu|anda) mengkritik|why (?:are you criticizing|do you criticize))\b[^!?]{0,110}\?$/u;
const otherParty =
  "(?:pemerintah(?:an)? (?:sebelumnya|terdahulu)|tim lain|kubu lain|pihak lain|the (?:previous|last) administration|the other (?:party|team)|your party)";
const pivot = new RegExp(
  "^(?:(?:what about|bagaimana dengan|gimana dengan)\\s+" +
    otherParty +
    "|(?:(?:lihat|look at)\\s+)?" +
    otherParty +
    "\\b[^.!?]{0,60}\\b(?:juga|also|did the same)\\b)",
  "u",
);
const criticism =
  /\b(?:gagal|merugikan|menyalahgunakan|melanggar|curang|bermasalah|failed|hurts|violat(?:es|ed)|broke the rules|unfair)\b/u;
const negatedCriticism =
  /\b(?:tidak|bukan|never|didn't|did not)\s+(?:gagal|merugikan|melanggar|curang|bermasalah|fail|hurt|violate|cheat)\b/u;
const addressesCritique =
  /\b(?:kritik (?:ini|itu) (?:benar|valid|beralasan)|both (?:decisions|cases) (?:were|are) wrong|the criticism is valid)\b/u;

export const detectWhataboutism: Detector = function* (context) {
  const originals = originalSentences(context);
  for (const [index, { rulesText, span }] of context.sentences.entries()) {
    const direct = refusal.exec(rulesText);
    if (!direct && !challengesCritique.test(rulesText)) continue;
    const next = context.sentences[index + 1];
    const sameSentence =
      direct &&
      pivot.test(rulesText.slice(direct[0].length).replace(/^[,;:]\s*/u, ""));
    const pivotText = sameSentence ? rulesText : (next?.rulesText ?? "");
    if (
      (!sameSentence && !pivot.test(pivotText)) ||
      addressesCritique.test(pivotText) ||
      addressesCritique.test(
        context.sentences[index + (sameSentence ? 1 : 2)]?.rulesText ?? "",
      )
    )
      continue;
    const matchedSpan =
      sameSentence || !next ? span : { start: span.start, end: next.span.end };
    if (!originals.length) {
      yield {
        span: matchedSpan,
        confidenceLevel: "insufficient_context",
        explanation:
          "Respons beralih ke tindakan pihak lain setelah mempersoalkan pembahasan kritik.",
        evidence: ["Ada perpindahan dari kritik ke tindakan pihak lain."],
        limitations: ["Kritik asli yang dapat dibandingkan belum tersedia."],
      };
    } else if (
      originals.some(
        (text) => criticism.test(text) && !negatedCriticism.test(text),
      )
    ) {
      yield {
        span: matchedSpan,
        confidenceLevel: direct ? "likely" : "possible",
        explanation:
          "Respons mengarahkan pembahasan ke tindakan pihak lain setelah menolak atau mempersoalkan pembahasan kritik yang dikutip.",
        evidence: [
          "Sumber terkait mengajukan kritik yang dapat diidentifikasi.",
          "Respons mengalihkan pembahasan dengan menyebut tindakan pihak lain.",
        ],
        limitations: [
          "Aturan ini hanya menilai kritik dan respons yang tersedia.",
        ],
      };
    }
  }
};
