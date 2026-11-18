import type { Detector } from "../models/detector";
import { addressee, fromDisagreement, lostCare } from "./conditional";

const opposingSide =
  "(?:bagian dari masalah|musuh(?: kami| kita)?|pengkhianat|melawan kami|against us|part of the problem|a traitor)\\b";
const forcedEquivalence = new RegExp(
  fromDisagreement + addressee + "(?:" + opposingSide + "|" + lostCare + ")",
  "u",
);
const explicitChoice = new RegExp(
  "^(?:cuma ada dua pilihan|hanya ada dua pilihan|pilihannya (?:cuma|hanya) dua|there are only two (?:choices|options))" +
    "\\s*[:,]\\s*(?:dukung|mendukung|support)\\b[^.!?]{0,100}\\s+(?:atau|or)\\s+" +
    addressee +
    opposingSide,
  "u",
);

export const detectFalseDilemma: Detector = function* ({ sentences }) {
  for (const { rulesText, span } of sentences) {
    if (rulesText.endsWith("?")) continue;

    if (explicitChoice.test(rulesText)) {
      yield {
        span,
        confidenceLevel: "likely",
        explanation:
          "Kalimat ini membatasi pilihan pada mendukung usulan atau dianggap sebagai lawan.",
        evidence: [
          "Kalimat menyatakan hanya ada dua pilihan.",
          "Pilihan kedua memberi cap kepada pihak yang tidak mendukung.",
        ],
      };
    } else if (forcedEquivalence.test(rulesText)) {
      yield {
        span,
        confidenceLevel: "possible",
        explanation:
          "Kalimat ini menyamakan sikap tidak mendukung dengan memihak lawan atau tidak peduli. Masih mungkin ada alasan atau posisi lain.",
        evidence: [
          "Dukungan dipakai sebagai batas antara dua posisi.",
          "Orang yang tidak mendukung langsung ditempatkan pada posisi yang berlawanan.",
        ],
      };
    }
  }
};
