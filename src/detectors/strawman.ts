import type { Detector } from "../models/detector";
import { originalSentences } from "./original-context";

const boundedProposal =
  /^(?:(?:mari|saya usul|kami mengusulkan|let's|i propose we)\s+)?(?:batasi|membatasi|kurangi|mengurangi|limit|restrict|reduce)\s+(?<subject>[^.!?,;]{1,70}?)\s+(?:hanya\s+|only\s+)?(?:pada|saat|selama|di|on|during|at|in)\s+(?:akhir pekan|jam sibuk|pusat kota|area sekolah|weekends|rush hour|downtown|school zones?)\b/u;
const totalBan =
  "(?:melarang|larang|ban|hapus|menghapus)\\s+(?:semua|seluruh|all|every)\\s+(?<subject>[^.!?,;]{1,70}?)\\s+(?:selamanya|forever|di semua tempat|everywhere)\\b";
const representation = new RegExp(
  "^(?:(?:jadi|so)\\s+)?(?:(?:dia|mereka|kamu) (?:mau|ingin)|menurutmu kita harus|you want to|they want to)\\s+" +
    totalBan,
  "u",
);
const originalBan = new RegExp("\\b" + totalBan, "u");
const attacksClaim =
  /^(?:usulnya|usul itu|ide itu|argumennya|itu|that's|that is|the idea is)\s+(?:ngawur|konyol|absurd|ridiculous|nonsense)\b/u;
const correction =
  /^(?:eh,?\s+)?(?:ternyata\s+)?(?:(?:saya|aku|kami) salah (?:baca|paham|mengutip)|i (?:misread|misunderstood)|i take that back)\b/u;

export const detectStrawman: Detector = function* (context) {
  const originals = originalSentences(context);
  for (const [index, { rulesText, span }] of context.sentences.entries()) {
    if (rulesText.endsWith("?")) continue;
    const claim = representation.exec(rulesText);
    const subject = claim?.groups?.subject;
    if (!claim || !subject) continue;
    const next = context.sentences[index + 1];
    const sameSentence = attacksClaim.test(
      rulesText.slice(claim[0].length).replace(/^[,;:]\s*/u, ""),
    );
    if (
      (!sameSentence && !attacksClaim.test(next?.rulesText ?? "")) ||
      correction.test(
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
          "Respons menggambarkan klaim pihak lain sebagai larangan menyeluruh dan menyerang gambaran itu.",
        evidence: [
          "Ada representasi atas klaim pihak lain dan serangan terhadapnya.",
        ],
        limitations: ["Klaim asli belum tersedia untuk diperbandingkan."],
      };
    } else if (
      originals.some(
        (text) => boundedProposal.exec(text)?.groups?.subject === subject,
      ) &&
      !originals.some(
        (text) => originalBan.exec(text)?.groups?.subject === subject,
      )
    ) {
      yield {
        span: matchedSpan,
        confidenceLevel: "likely",
        explanation:
          "Klaim asli membatasi tindakan pada waktu atau tempat tertentu. Respons mengubahnya menjadi larangan menyeluruh lalu menyerang versi tersebut.",
        evidence: [
          "Kedua teks membicarakan sasaran yang sama.",
          "Lingkup berubah dari pembatasan tertentu menjadi larangan menyeluruh.",
          "Serangan diarahkan pada versi yang diperluas.",
        ],
        limitations: ["Perbandingan didasarkan pada klaim asli yang tersedia."],
      };
    }
  }
};
