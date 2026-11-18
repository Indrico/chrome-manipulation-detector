import { expect, it } from "vitest";
import { extractContext } from "../../src/core/context-extractor";
import { detectAdHominem } from "../../src/detectors/ad-hominem";
import { detectFalseDilemma } from "../../src/detectors/false-dilemma";
import { detectGuiltTripping } from "../../src/detectors/guilt-tripping";
import { detectAppealToAuthority } from "../../src/detectors/appeal-to-authority";
import { detectLoadedQuestions } from "../../src/detectors/loaded-questions";
import { detectFalseUrgency } from "../../src/detectors/false-urgency";
import { detectWhataboutism } from "../../src/detectors/whataboutism";
import { detectStrawman } from "../../src/detectors/strawman";
import { supportedPatternIds } from "../../src/data/patterns";
import type { PatternId } from "../../src/models/pattern";
import type { Detector } from "../../src/models/detector";
import { detectionFixtures } from "../support/detection-fixtures";

const detectors: Record<PatternId, Detector> = {
  "ad-hominem": detectAdHominem,
  "false-dilemma": detectFalseDilemma,
  "guilt-tripping": detectGuiltTripping,
  "appeal-to-authority": detectAppealToAuthority,
  "loaded-questions": detectLoadedQuestions,
  "false-urgency": detectFalseUrgency,
  whataboutism: detectWhataboutism,
  strawman: detectStrawman,
};

const cases = supportedPatternIds.flatMap((patternId) =>
  detectionFixtures
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
