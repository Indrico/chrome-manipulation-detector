import { describe, expect, it } from "vitest";
import { detectionResultSchema } from "../../src/models/detection-result";
import {
  applySettingsPatch,
  defaultSettings,
  readSettings,
  settingsMessageSchema,
} from "../../src/storage/settings";

describe("detection result schema", () => {
  const result = {
    patternId: "ad-hominem",
    patternName: "Ad Hominem",
    confidenceLevel: "possible",
    matchedText: "Kalau kamu tidak setuju, kamu bodoh.",
    span: { start: 8, end: 44 },
    explanation: "Julukan pribadi dipakai untuk menanggapi ketidaksetujuan.",
    evidence: ["Ketidaksetujuan dikaitkan dengan serangan pribadi."],
  };

  it("accepts evidence with an original text span", () => {
    expect(detectionResultSchema.parse(result)).toEqual(result);
  });

  it("checks the original span length, category, and qualitative confidence", () => {
    expect(
      detectionResultSchema.safeParse({ ...result, span: { start: 2, end: 5 } })
        .success,
    ).toBe(false);
    expect(
      detectionResultSchema.safeParse({ ...result, patternId: "unknown" })
        .success,
    ).toBe(false);
    expect(
      detectionResultSchema.safeParse({ ...result, confidence: 0.8 }).success,
    ).toBe(false);
  });

  it("requires limitations when context is insufficient", () => {
    const limited = { ...result, confidenceLevel: "insufficient_context" };
    expect(detectionResultSchema.safeParse(limited).success).toBe(false);
    expect(
      detectionResultSchema.safeParse({
        ...limited,
        limitations: ["Konteks belum ada."],
      }).success,
    ).toBe(true);
  });
});

describe("local settings", () => {
  it("uses defaults for missing or invalid saved settings", () => {
    for (const value of [
      undefined,
      null,
      { version: 1, enabled: "true" },
      { version: 2 },
    ]) {
      expect(readSettings(value)).toEqual(defaultSettings());
    }
  });

  it("merges individual category changes with existing settings", () => {
    const first = applySettingsPatch(defaultSettings(), {
      enabled: false,
      categories: { "ad-hominem": false },
    });
    expect(
      applySettingsPatch(first, { categories: { "guilt-tripping": false } }),
    ).toEqual({
      version: 1,
      enabled: false,
      showAnnotations: true,
      categories: { "ad-hominem": false, "guilt-tripping": false },
    });
  });

  it("rejects malformed and unrelated messages", () => {
    expect(
      settingsMessageSchema.safeParse({
        type: "settings:patch",
        patch: { enabled: "false" },
      }).success,
    ).toBe(false);
    expect(
      settingsMessageSchema.safeParse({
        type: "settings:patch",
        patch: { categories: { unknown: false } },
      }).success,
    ).toBe(false);
    expect(
      settingsMessageSchema.safeParse({ type: "settings:reset", extra: true })
        .success,
    ).toBe(false);
  });
});
