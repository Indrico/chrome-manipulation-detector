import type { Detector } from "../models/detector";
import {
  addressee,
  clauseBreak,
  condition,
  fromDisagreement,
  lostCare,
} from "./conditional";

const pastHelp =
  /^(?:(?:setelah|habis|abis) semua (?:hal )?yang\s+(?:sudah\s+)?(?:aku|saya|kami|kita)\s+(?:sudah\s+)?(?:lakukan|berikan|korbankan)|after all (?:i|we)(?:'ve| have)?\s+(?:done|did|given|sacrificed))\b[^,;.!?]{0,100}[,;]\s*/u;
const sacrifice =
  /^(?:aku|saya|kami|kita)\s+sudah\s+(?:banyak\s+)?berkorban\s+(?:demi|untuk|buat)\s+(?:kamu|anda)\b/u;
const pressForAction = new RegExp(
  "^(?:" +
    addressee +
    "(?:masih\\s+)?tega|(?:kok|masa)\\s+" +
    addressee +
    "(?:masih\\s+)?(?:tega\\s+)?|how could you)\\s*(?:menolak|tidak (?:mau )?(?:bantu|membantu)|say no|refuse)\\b",
  "u",
);
const moralObligation = new RegExp(
  "^" +
    condition +
    "(?:(?:benar-benar|really|truly)\\s+)?(?:peduli|sayang|care)\\b[^,;.!?]{0,100}" +
    clauseBreak +
    addressee +
    "(?:harus|wajib|pasti|must|have to)\\s+(?:dukung|mendukung|support|bantu|membantu|help|setuju|agree|bagikan|share)\\b",
  "u",
);
const agreementAsMoralTest = new RegExp(
  fromDisagreement + addressee + lostCare,
  "u",
);

export const detectGuiltTripping: Detector = function* ({ sentences }) {
  for (const [index, sentence] of sentences.entries()) {
    const { rulesText, span } = sentence;
    const help = pastHelp.exec(rulesText);
    const next = sentences[index + 1];
    const hasAdjacentPressure =
      next && sacrifice.test(rulesText) && pressForAction.test(next.rulesText);
    if (
      (help && pressForAction.test(rulesText.slice(help[0].length))) ||
      hasAdjacentPressure
    ) {
      yield {
        span: hasAdjacentPressure
          ? { start: span.start, end: next.span.end }
          : span,
        confidenceLevel: "likely",
        explanation:
          "Kalimat ini memakai bantuan atau pengorbanan sebelumnya untuk menekan seseorang agar tidak menolak.",
        evidence: [
          "Bantuan atau pengorbanan sebelumnya disebut.",
          "Penolakan digambarkan sebagai tindakan yang patut disesali.",
        ],
      };
    } else if (
      !rulesText.endsWith("?") &&
      (moralObligation.test(rulesText) || agreementAsMoralTest.test(rulesText))
    ) {
      yield {
        span,
        confidenceLevel: "possible",
        explanation:
          "Kalimat ini mengaitkan rasa peduli seseorang dengan kesediaannya untuk setuju atau bertindak.",
        evidence: [
          "Kepedulian dipakai sebagai ukuran moral.",
          "Persetujuan atau tindakan tertentu dijadikan syarat untuk menunjukkan kepedulian.",
        ],
      };
    }
  }
};
