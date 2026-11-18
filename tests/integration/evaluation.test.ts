import { cpus, platform, release } from "node:os";
import { expect, it } from "vitest";
import { analyzePost } from "../../src/core/detection-engine";
import { supportedPatternIds } from "../../src/data/patterns";
import { phase2Fixtures } from "../support/phase-2-fixtures";

const holdout = phase2Fixtures.filter(({ split }) => split === "holdout");

it.each(holdout)("reserved fixture $id", ({ input, expected, rationale }) => {
  const results = analyzePost(input);
  expect(
    Object.fromEntries(
      results.map(({ patternId, confidenceLevel }) => [
        patternId,
        confidenceLevel,
      ]),
    ),
    rationale,
  ).toEqual(expected);
});

it("keeps the dataset and reserved split balanced by category and case type", () => {
  expect(new Set(phase2Fixtures.map(({ id }) => id)).size).toBe(60);
  for (const target of supportedPatternIds) {
    for (const group of [
      "positive",
      "negative",
      "ambiguous",
      "educational",
      "context",
    ]) {
      const cases = phase2Fixtures.filter(
        (fixture) => fixture.target === target && fixture.group === group,
      );
      expect(cases.map(({ split }) => split).sort()).toEqual([
        "development",
        "development",
        "development",
        "holdout",
      ]);
    }
  }
});

function ratio(numerator: number, denominator: number) {
  return denominator === 0
    ? null
    : Number((numerator / denominator).toFixed(3));
}

it("reports synthetic classification metrics and an engine timing baseline", () => {
  const evaluated = phase2Fixtures.map((fixture) => ({
    fixture,
    results: analyzePost(fixture.input),
  }));
  const metrics = [];
  for (const split of ["development", "holdout"]) {
    const cases = evaluated.filter(({ fixture }) => fixture.split === split);
    const ambiguousCases = cases.filter(
      ({ fixture }) => fixture.group === "ambiguous",
    );
    const binaryCases = cases.filter(
      ({ fixture }) => fixture.group !== "ambiguous",
    );
    for (const patternId of supportedPatternIds) {
      let tp = 0;
      let tn = 0;
      let fp = 0;
      let fn = 0;
      for (const { fixture, results } of binaryCases) {
        const expected = fixture.expected[patternId];
        const positive = expected === "possible" || expected === "likely";
        const flagged = results.some(
          (result) =>
            result.patternId === patternId &&
            result.confidenceLevel !== "insufficient_context",
        );
        if (positive && flagged) tp++;
        if (!positive && !flagged) tn++;
        if (!positive && flagged) fp++;
        if (positive && !flagged) fn++;
      }
      metrics.push({
        split,
        patternId,
        tp,
        tn,
        fp,
        fn,
        precision: ratio(tp, tp + fp),
        recall: ratio(tp, tp + fn),
        falsePositiveRate: ratio(fp, fp + tn),
        falseNegativeRate: ratio(fn, fn + tp),
        ambiguousFlagged: ambiguousCases.filter(({ results }) =>
          results.some(
            (result) =>
              result.patternId === patternId &&
              result.confidenceLevel !== "insufficient_context",
          ),
        ).length,
        ambiguousCases: ambiguousCases.length,
      });
    }
  }
  console.table(metrics);

  for (let round = 0; round < 10; round++) {
    for (const { input } of phase2Fixtures) analyzePost(input);
  }
  const timings: number[] = [];
  for (let round = 0; round < 50; round++) {
    for (const { input } of phase2Fixtures) {
      const started = performance.now();
      analyzePost(input);
      timings.push(performance.now() - started);
    }
  }
  timings.sort((a, b) => a - b);
  const percentile = (quantile: number) =>
    timings[Math.ceil(quantile * timings.length) - 1]!;
  console.log({
    evaluations: timings.length,
    median_ms: Number(percentile(0.5).toFixed(4)),
    p95_ms: Number(percentile(0.95).toFixed(4)),
    node: process.version,
    os: `${platform()} ${release()}`,
    cpu: cpus()[0]?.model.trim(),
  });
});
