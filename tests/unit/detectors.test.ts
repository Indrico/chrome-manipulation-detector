import { expect, it } from "vitest";
import { extractContext } from "../../src/core/context-extractor";
import { detectAdHominem } from "../../src/detectors/ad-hominem";
import { detectFalseDilemma } from "../../src/detectors/false-dilemma";
import { detectGuiltTripping } from "../../src/detectors/guilt-tripping";
import {
  supportedPatternIds,
  type SupportedPatternId,
} from "../../src/data/patterns";
import type { Detector } from "../../src/models/detector";
import { phase2Fixtures } from "../support/phase-2-fixtures";

const detectors: Record<SupportedPatternId, Detector> = {
  "ad-hominem": detectAdHominem,
  "false-dilemma": detectFalseDilemma,
  "guilt-tripping": detectGuiltTripping,
};

const cases = supportedPatternIds.flatMap((patternId) =>
  phase2Fixtures
    .filter(
      (fixture) =>
        fixture.target === patternId && fixture.split === "development",
    )
    .map((fixture) => ({ ...fixture, patternId })),
);

it.each(cases)("$id", (fixture) => {
  const results = Array.from(
    detectors[fixture.patternId](extractContext(fixture.input)),
  );
  const expected = fixture.expected[fixture.patternId];
  if (!expected) {
    expect(results, fixture.rationale).toEqual([]);
    return;
  }
  expect(
    results.map(({ confidenceLevel }) => confidenceLevel),
    fixture.rationale,
  ).toContain(expected);
});
