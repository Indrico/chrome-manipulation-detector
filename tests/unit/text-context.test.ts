import { expect, it } from "vitest";
import { extractContext } from "../../src/core/context-extractor";
import { normalizeText } from "../../src/core/text-normalizer";
import { analyzePost } from "../../src/core/detection-engine";

it.each([
  ["Kalau lu nggak setuju, lu bodoh.", "id"],
  ["Kalau lu don't agree, lu idiot.", "mixed"],
  ["If you don't agree, you're an idiot.", "en"],
  ["先看看。", "unknown"],
] as const)("identifies language cues in %s", (text, language) => {
  expect(extractContext({ text }).language).toBe(language);
});

it("normalizes tokens and does not apply slang substitutions inside longer words", () => {
  expect(
    normalizeText(
      "ＰＥＲＧＩ, LU gk sm logika? @contoh https://example.test/gk",
    ),
  ).toBe("pergi, kamu tidak sama logika?");
});

it("passes related context through separately from the author's words", () => {
  const related = {
    source: "reply_target",
    text: "Will you support the plan?",
  } as const;
  const { sentences, relatedPosts, language } = extractContext({
    text: "Aku mau mempertimbangkan dulu.",
    context: [related],
  });
  expect(sentences[0]?.rulesText).toBe("aku mau mempertimbangkan dulu.");
  expect(language).toBe("id");
  expect(relatedPosts).toEqual([related]);
});

it("detects obligation in a slang-heavy clause and with a curved English apostrophe", () => {
  for (const text of [
    "Abis semua yg udah kita lakuin buat lu, kok lu masih tega nolak?",
    "After all we’ve done for you, how could you refuse?",
  ]) {
    expect(analyzePost({ text }, ["guilt-tripping"])).toEqual([
      expect.objectContaining({ confidenceLevel: "likely", matchedText: text }),
    ]);
  }
});
