import type { Detector } from "../models/detector";

const immediateAction =
  /^(?:(?:tolong|please|ayo)\s+)?(?:bagikan|beli|daftar|kirim|klik|tanda tangani|teruskan|share|buy|sign up|send|click|act|forward)\s+(?:sekarang(?: juga)?|detik ini|right now|immediately|this instant)\b/u;
const blocksVerification =
  /(?:^|\s)(?:jangan\s+(?:cek|periksa|verifikasi|pikir (?:dulu|panjang))|(?:don't|do not)\s+(?:check|verify|think (?:twice|about it))|(?:no time to|without)\s+(?:check(?:ing)?|verify(?:ing)?))\b/u;
const consequence =
  /(?:^|\s)(?:kalau tidak|jika tidak|atau|or|otherwise),?\s+([^.!?]{1,120})/u;
const permanentLoss =
  /\b(?:hilang selamanya|kehilangan[^.!?]{1,45}selamanya|lose[^.!?]{1,45}forever|gone forever)\b/u;
const negatedLoss =
  /\b(?:(?:tidak|tak)(?: akan)? (?:hilang|kehilangan)|(?:won't|will not|never) (?:lose|be gone))\b/u;

function threatensLoss(text: string): boolean {
  const outcome = consequence.exec(text)?.[1];
  return !!outcome && permanentLoss.test(outcome) && !negatedLoss.test(outcome);
}

export const detectFalseUrgency: Detector = function* ({ sentences }) {
  for (const [index, { rulesText, span }] of sentences.entries()) {
    if (!immediateAction.test(rulesText) || rulesText.endsWith("?")) continue;
    const next = sentences[index + 1];
    const blockedInSentence = blocksVerification.test(rulesText);
    const lossInSentence = threatensLoss(rulesText);
    const blocked =
      blockedInSentence || blocksVerification.test(next?.rulesText ?? "");
    const loss = lossInSentence || threatensLoss(next?.rulesText ?? "");
    if (!blocked && !loss) continue;
    const hasSameSentenceEvidence = blocked
      ? blockedInSentence
      : lossInSentence;

    yield {
      span:
        hasSameSentenceEvidence || !next
          ? span
          : { start: span.start, end: next.span.end },
      confidenceLevel: blocked ? "likely" : "possible",
      explanation: blocked
        ? "Ajakan bertindak segera disertai larangan memeriksa informasi terlebih dulu."
        : "Ajakan bertindak segera disertai ancaman kehilangan kesempatan secara permanen.",
      evidence: [
        "Ada permintaan untuk segera bertindak.",
        blocked
          ? "Teks menghalangi verifikasi atau pertimbangan."
          : "Teks mengaitkan penundaan dengan kehilangan permanen.",
      ],
      limitations: [
        "Aturan ini tidak memverifikasi kebenaran tenggat atau konsekuensi yang disebut.",
      ],
    };
  }
};
