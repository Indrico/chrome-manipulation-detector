import type { Detector } from "../models/detector";
import { addressee, fromDisagreement } from "./conditional";

const personalAttack =
  addressee +
  "(?:(?:itu|dasar|seorang|orang|really|a|an)\\s+)?(?:bodoh|tolol|goblok|bego|idiot|moron|stupid)(?![\\p{L}\\p{N}])";
const dismissal =
  "(?:(?:pendapat|argumen|opini)(?:mu| kamu| anda)?\\s+(?:tidak (?:perlu|layak|pantas) didengar|tidak penting|tidak valid)|your (?:argument|opinion) (?:is (?:invalid|worthless)|doesn't matter))";
const conditionalInsult = new RegExp(fromDisagreement + personalAttack, "u");
const dismissBecauseOfInsult = new RegExp(
  "^" + dismissal + "\\s+(?:karena|sebab|because)\\s+" + personalAttack,
  "u",
);
const dismissBeforeReason = new RegExp("^" + dismissal + "[.!]?$", "u");
const dismissAfterInsult = new RegExp(
  "^" + personalAttack + "[,;]\\s*(?:jadi|maka|so)\\s+" + dismissal + "\\b",
  "u",
);
const linkedReason = new RegExp(
  "^(?:soalnya|karena|sebab|because)\\s+" + personalAttack,
  "u",
);

export const detectAdHominem: Detector = function* ({ sentences }) {
  for (const [index, sentence] of sentences.entries()) {
    const { rulesText, span } = sentence;
    if (!rulesText || rulesText.endsWith("?")) continue;

    const next = sentences[index + 1];
    const hasAdjacentReason =
      next &&
      !next.rulesText.endsWith("?") &&
      dismissBeforeReason.test(rulesText) &&
      linkedReason.test(next.rulesText);
    if (
      hasAdjacentReason ||
      dismissBecauseOfInsult.test(rulesText) ||
      dismissAfterInsult.test(rulesText)
    ) {
      yield {
        span: hasAdjacentReason
          ? { start: span.start, end: next.span.end }
          : span,
        confidenceLevel: "likely",
        explanation:
          "Kalimat ini memakai hinaan terhadap seseorang sebagai alasan untuk menolak pendapatnya.",
        evidence: [
          "Pendapat ditolak secara eksplisit.",
          "Alasan penolakan mengarah pada orang yang menyampaikan pendapat.",
        ],
      };
    } else if (conditionalInsult.test(rulesText)) {
      yield {
        span,
        confidenceLevel: "possible",
        explanation:
          "Kalimat ini menanggapi ketidaksetujuan dengan hinaan pribadi tanpa membahas alasan perbedaannya.",
        evidence: [
          "Klausa pertama menyebut ketidaksetujuan.",
          "Klausa kedua menyerang pribadi orang yang berbeda pendapat.",
        ],
      };
    }
  }
};
