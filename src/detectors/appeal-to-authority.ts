import type { Detector } from "../models/detector";

const title =
  "(?:dokter|profesor|ilmuwan|ahli|pakar|doctor|professor|scientist|expert)\\b";
const attribution = new RegExp(
  "^(?:(?:menurut|kata|according to)\\s+(?:(?:the|a|an)\\s+)?" +
    title +
    "|(?:(?:the|a|an)\\s+(?:famous\\s+)?)?" +
    title +
    "(?:\\s+(?:itu|ini|terkenal|tadi|spesialis)){0,2}[ ,]+(?:bilang|mengatakan|menyatakan|says|said|claims)\\b)",
  "u",
);
const dropsEvidence =
  /(?:^|[,;:]\s*)(?:jadi|maka|makanya|so|therefore)\s+(?:tidak (?:perlu|usah)\s+(?:penelitian|uji|bukti|cek|memeriksa|verifikasi)|(?:(?:there's|there is)\s+)?no need (?:to|for)\s+(?:check|verify|test|more evidence|a trial|research))\b/u;
const keepsEvidence =
  /\b(?:tetap (?:perlu|harus) (?:cek|memeriksa|diperiksa|uji|diteliti|verifikasi)|still (?:need|have) to (?:check|verify|test)|(?:need|need to see) (?:more )?evidence)\b/u;

export const detectAppealToAuthority: Detector = function* ({ sentences }) {
  for (const [index, { rulesText, span }] of sentences.entries()) {
    const claim = attribution.exec(rulesText);
    if (!claim || rulesText.endsWith("?")) continue;
    const next = sentences[index + 1];
    if (
      keepsEvidence.test(rulesText) ||
      (next && keepsEvidence.test(next.rulesText))
    )
      continue;
    const sameSentence =
      claim[0].length < rulesText.length &&
      dropsEvidence.test(rulesText.slice(claim[0].length));
    const followingSentence =
      next &&
      !next.rulesText.endsWith("?") &&
      dropsEvidence.test(next.rulesText) &&
      !keepsEvidence.test(sentences[index + 2]?.rulesText ?? "");
    if (!sameSentence && !followingSentence) continue;

    yield {
      span:
        sameSentence || !next
          ? span
          : { start: span.start, end: next.span.end },
      confidenceLevel: "likely",
      explanation:
        "Pernyataan ahli dipakai untuk menutup pemeriksaan atas klaim yang disampaikan.",
      evidence: [
        "Klaim dihubungkan dengan seseorang yang disebut berwenang.",
        "Pemeriksaan bukti dinyatakan tidak perlu.",
      ],
    };
  }
};
