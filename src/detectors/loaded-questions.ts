import type { Detector } from "../models/detector";

const presupposingQuestion =
  /^(?:jadi,?\s+)?(?:(?:kapan|sejak kapan)\s+(?:kamu|anda)\s+(?:(?:berhenti|stop)\s+)?|(?:kenapa|mengapa)\s+(?:kamu|anda)\s+(?:masih|terus)\s+|berapa kali\s+(?:kamu|anda)\s+|when (?:did|will) you stop\s+|why (?:are you still|do you keep)\s+|how many times (?:have|did) you\s+)/u;
const assumptions = [
  /^(?:menyebar(?:kan)? (?:kebohongan|kabar palsu|hoaks)|berbohong|bohong|lie|lied|lying)\b/u,
  /^(?:memalsukan|memanipulasi|falsif(?:y|ied|ying))\s+(?:(?:the|your)\s+)?(?:data|angka|laporan|figures|records|report)\b/u,
  /^(?:curang|menipu|cheat(?:ed|ing)?|mencuri|steal(?:ing)?|stolen)\b/u,
];
const admission =
  /^(?:(?:kamu|anda) (?:mengaku|sudah mengaku|mengakui)(?: bahwa)?(?: sudah)?|you (?:admit|admitted)(?: that)?(?: you)?(?: had)?)\s+/u;
const qualifiesPremise =
  /\b(?:(?:kalau|jika) memang (?:benar|kamu|anda)|if you (?:ever|actually))\b/u;

export const detectLoadedQuestions: Detector = function* ({ sentences }) {
  for (const [index, { rulesText, span }] of sentences.entries()) {
    if (!rulesText.endsWith("?") || qualifiesPremise.test(rulesText)) continue;
    const question = presupposingQuestion.exec(rulesText);
    if (!question) continue;
    const predicate = rulesText.slice(question[0].length);
    const assumption = assumptions.find((pattern) => pattern.test(predicate));
    if (!assumption) continue;
    const previous = sentences[index - 1]?.rulesText ?? "";
    const admitted = admission.exec(previous);
    if (admitted && assumption.test(previous.slice(admitted[0].length)))
      continue;

    yield {
      span,
      confidenceLevel: "likely",
      explanation:
        "Bentuk pertanyaannya mengandaikan tindakan yang dituduhkan sudah terjadi. Menjawab langsung dapat memberi kesan menerima tuduhan itu.",
      evidence: [
        "Pertanyaan menanyakan waktu, pengulangan, atau kelanjutan tindakan.",
        "Tuduhan melekat pada bentuk pertanyaan.",
      ],
    };
  }
};
