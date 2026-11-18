import { describe, expect, it } from "vitest";
import { analyzePost } from "../../src/core/detection-engine";
import {
  defaultSettings,
  applySettingsPatch,
  enabledPatterns,
} from "../../src/storage/settings";
import { detectionResultSchema } from "../../src/models/detection-result";
import { supportedPatternIds } from "../../src/data/patterns";
import { phase2Fixtures } from "../support/phase-2-fixtures";

describe("detection pipeline", () => {
  const cases = phase2Fixtures.filter(({ split }) => split === "development");
  it.each(cases)("$id", (fixture) => {
    const results = analyzePost(fixture.input);
    expect(
      Object.fromEntries(
        results.map(({ patternId, confidenceLevel }) => [
          patternId,
          confidenceLevel,
        ]),
      ),
      fixture.rationale,
    ).toEqual(fixture.expected);
    for (const result of results) {
      expect(detectionResultSchema.parse(result)).toEqual(result);
      expect(fixture.input.text.slice(result.span.start, result.span.end)).toBe(
        result.matchedText,
      );
    }
  });

  it("keeps the original excerpt and uses UTF-16 offsets after an emoji, quotes, and normalization", () => {
    const excerpt = "Kalau ＬＵ nggak setuju, lu BODOH!";
    const text = `😀 “Kamu bodoh.”\n  ${excerpt}   \nKalimat lain.`;
    const results = analyzePost({ text });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      patternId: "ad-hominem",
      matchedText: excerpt,
      span: {
        start: text.indexOf(excerpt),
        end: text.indexOf(excerpt) + excerpt.length,
      },
    });
  });

  it("skips globally disabled and individually disabled categories", () => {
    const input = {
      text: "Kalau kamu tidak mendukung kebijakan ini, berarti kamu tidak peduli dengan negara.",
    };
    const settings = defaultSettings();
    expect(
      analyzePost(input, enabledPatterns(settings, supportedPatternIds)),
    ).toHaveLength(2);
    const selected = applySettingsPatch(settings, {
      categories: { "false-dilemma": false },
    });
    expect(
      analyzePost(input, enabledPatterns(selected, supportedPatternIds)).map(
        ({ patternId }) => patternId,
      ),
    ).toEqual(["guilt-tripping"]);
    expect(
      analyzePost(
        input,
        enabledPatterns({ ...selected, enabled: false }, supportedPatternIds),
      ),
    ).toEqual([]);
  });

  it("picks stronger evidence, then the earliest evidence at the same level", () => {
    const firstStrong = "Argumenmu tidak perlu didengar karena kamu tolol.";
    const text = `Kalau kamu tidak setuju, kamu bodoh. ${firstStrong} Pendapatmu tidak penting karena kamu goblok.`;
    expect(analyzePost({ text }, ["ad-hominem"])).toEqual([
      expect.objectContaining({
        confidenceLevel: "likely",
        matchedText: firstStrong,
      }),
    ]);
  });

  it("handles empty input and categories planned for later phases", () => {
    expect(analyzePost({ text: " \n\t " })).toEqual([]);
    expect(
      analyzePost({ text: "Kalau kamu tidak setuju, kamu bodoh." }, [
        "strawman",
      ]),
    ).toEqual([]);
  });

  it("does not carry attribution over to a separate statement", () => {
    const excerpt = "Argumenmu tidak perlu didengar karena kamu tolol.";
    const text = `Dia bilang, “Menurutku anggarannya rendah.” ${excerpt}`;
    expect(analyzePost({ text }, ["ad-hominem"])).toEqual([
      expect.objectContaining({ matchedText: excerpt }),
    ]);
  });
});
