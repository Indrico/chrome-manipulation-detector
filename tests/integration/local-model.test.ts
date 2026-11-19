import { expect, it } from "vitest";
import { analyzePost } from "../../src/core/detection-engine";
import { unpackLocalModel } from "../../src/core/local-model";
import artifact from "../../src/data/local-model.json";
import { applySettingsPatch, readSettings } from "../../src/storage/settings";
import { localModelText } from "../support/x-timeline";

const model = unpackLocalModel(artifact);

it("uses the trained coefficients for model-only suggestions with the original excerpt", () => {
  expect(model).toBeDefined();
  expect(analyzePost({ text: localModelText })).toHaveLength(0);
  const [result] = analyzePost({ text: localModelText }, ["ad-hominem"], model);
  expect(result).toMatchObject({
    patternId: "ad-hominem",
    confidenceLevel: "possible",
  });
  expect(result?.limitations?.[0]).toContain("model lokal eksperimental");
  expect(localModelText.slice(result?.span.start, result?.span.end)).toBe(
    result?.matchedText,
  );
  expect(analyzePost({ text: localModelText }, [], model)).toHaveLength(0);
});

it("reuses quotation handling and bounds the model work per post", () => {
  expect(
    analyzePost(
      { text: `Dia bilang “${localModelText}”` },
      ["ad-hominem"],
      model,
    ),
  ).toHaveLength(0);
  expect(
    analyzePost({ text: localModelText.repeat(12) }, ["ad-hominem"], model),
  ).toHaveLength(0);
  expect(unpackLocalModel({ ...artifact, version: 2 })).toBeUndefined();
});

it("migrates an older preference by preserving categories and keeping the model opt-in", () => {
  const existing = {
    version: 1,
    enabled: false,
    showAnnotations: true,
    categories: { "guilt-tripping": false },
  };
  const settings = readSettings(existing);
  expect(settings).toEqual(existing);
  expect(settings.localModel).toBeUndefined();
  expect(applySettingsPatch(settings, { localModel: true })).toEqual({
    ...existing,
    localModel: true,
  });
});
