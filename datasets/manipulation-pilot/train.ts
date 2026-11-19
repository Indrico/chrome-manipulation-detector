import { mkdirSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { runnerImport } from "vite";
import {
  bestModelMatch,
  featureCount,
  modelPatterns,
  modelWindows,
  textFeatures,
  unpackLocalModel,
  type LocalModel,
  type ModelPattern,
  type PackedLocalModel,
} from "../../src/core/local-model.ts";
import {
  loadPilotRecords,
  loadPilotReviews,
  summarize,
  type PilotRecord,
} from "./validate.ts";

type TrainingExample = { features: number[]; positive: boolean };
type Prediction = { expected: boolean | undefined; flagged: boolean };
const expectedLabel = (row: PilotRecord, id: ModelPattern) => {
  const label = row.labels[id];
  return label ? (label.judgment === "present" ? true : undefined) : false;
};
const round = (value: number) => Number(value.toFixed(6));

function fit(examples: readonly TrainingExample[]) {
  const positives = examples.filter(({ positive }) => positive).length;
  if (!positives || positives === examples.length)
    throw new Error("Training needs both labels per category.");
  const weights = new Float64Array(featureCount);
  const gradient = new Float64Array(featureCount);
  const positiveWeight = 0.5 / positives;
  const negativeWeight = 0.5 / (examples.length - positives);
  const samples = examples.map((example) => ({
    ...example,
    normalizer: 1 / Math.sqrt(example.features.length),
  }));
  let bias = 0;
  for (let iteration = 0; iteration < 220; iteration++) {
    gradient.fill(0);
    let biasGradient = 0;
    for (const { features, positive, normalizer } of samples) {
      let linear = 0;
      for (const index of features) linear += weights[index]!;
      const probability = 1 / (1 + Math.exp(-(bias + linear * normalizer)));
      const residual = positive
        ? positiveWeight * (1 - probability)
        : -negativeWeight * probability;
      biasGradient += residual;
      const update = residual * normalizer;
      for (const index of features) gradient[index] = gradient[index]! + update;
    }
    const step = 3;
    for (let index = 0; index < weights.length; index++) {
      weights[index] =
        weights[index]! * (1 - step * 0.001) + step * gradient[index]!;
    }
    bias += step * biasGradient;
  }
  const scale = round(Math.max(...weights.map(Math.abs)) / 127);
  const compact = Int8Array.from(weights, (weight) =>
    Math.max(-127, Math.min(127, Math.round(weight / scale))),
  );
  return { weights: compact, scale, bias: round(bias), threshold: null };
}

function metrics(predictions: readonly Prediction[]) {
  let tp = 0,
    fp = 0,
    tn = 0,
    fn = 0,
    uncertainFlagged = 0,
    uncertain = 0;
  for (const { flagged, expected } of predictions) {
    if (expected === undefined) {
      uncertain++;
      if (flagged) uncertainFlagged++;
    } else if (expected) {
      if (flagged) tp++;
      else fn++;
    } else if (flagged) fp++;
    else tn++;
  }
  const ratio = (a: number, b: number) => (b ? round(a / b) : null);
  return {
    tp,
    fp,
    tn,
    fn,
    uncertain,
    uncertainFlagged,
    precision: ratio(tp, tp + fp),
    recall: ratio(tp, tp + fn),
    falsePositiveRate: ratio(fp, fp + tn),
    falseNegativeRate: ratio(fn, fn + tp),
  };
}

function tuneThreshold(
  validation: readonly { expected: boolean | undefined; score?: number }[],
) {
  let threshold: number | null = null;
  let best = -1;
  for (let step = -10; step <= 35; step++) {
    const candidate = step / 10;
    const { tp, fp, fn, precision } = metrics(
      validation.map(({ expected, score }) => ({
        expected,
        flagged: score !== undefined && score >= candidate,
      })),
    );
    if (tp < 3 || (precision ?? 0) < 0.8) continue;
    const f05 = (1.25 * tp) / (1.25 * tp + fp + 0.25 * fn);
    if (f05 >= best) {
      threshold = candidate;
      best = f05;
    }
  }
  return threshold;
}

async function main() {
  const records = loadPilotRecords();
  const reviews = loadPilotReviews();
  if (summarize(records, reviews).missingHumanExamples) {
    throw new Error(
      "Training the pilot model requires the full 2,000-example dataset.",
    );
  }
  const reviewById = new Map(reviews.map((row) => [row.id, row]));
  const train = records.filter(({ split }) => split === "train");
  const validation = records.filter(({ split }) => split === "validation");

  const {
    module: { extractContext },
  } = await runnerImport<typeof import("../../src/core/context-extractor.ts")>(
    "./src/core/context-extractor.ts",
    { configFile: false },
  );
  const {
    module: { analyzePost },
  } = await runnerImport<typeof import("../../src/core/detection-engine.ts")>(
    "./src/core/detection-engine.ts",
    { configFile: false },
  );
  const normalize = (text: string) =>
    extractContext({ text })
      .sentences.map(({ rulesText }) => rulesText)
      .join(" ");
  const trainingText = train.map((row) =>
    textFeatures(normalize(row.input.text)),
  );
  const validationWindows = validation.map((row) =>
    modelWindows(extractContext(row.input)),
  );
  const packed = {} as Record<
    ModelPattern,
    PackedLocalModel["classifiers"][ModelPattern]
  >;
  const tuning = [];
  for (const id of modelPatterns) {
    const examples = train.flatMap((row, index) => {
      const positive = expectedLabel(row, id);
      if (positive === undefined) return [];
      const evidence = row.labels[id]?.evidence?.text;
      const excerpt =
        positive && evidence ? textFeatures(normalize(evidence)) : [];
      const features = excerpt.length ? excerpt : trainingText[index]!;
      return features.length ? [{ features, positive }] : [];
    });
    const fitted = fit(examples);
    const entries = validation.map((row, index) => ({
      expected: expectedLabel(row, id),
      score: bestModelMatch(fitted, validationWindows[index]!)?.score,
    }));
    const threshold = tuneThreshold(entries);
    packed[id] = {
      ...fitted,
      threshold,
      weights: Buffer.from(fitted.weights).toString("base64"),
    };
    tuning.push({
      pattern: id,
      trainingExamples: examples.length,
      trainingPositive: examples.filter(({ positive }) => positive).length,
      threshold,
      validation: metrics(
        entries.map(({ expected, score }) => ({
          expected,
          flagged:
            score !== undefined && threshold !== null && score >= threshold,
        })),
      ),
    });
  }
  console.log(
    JSON.stringify(
      { train: train.length, validation: validation.length, tuning },
      null,
      2,
    ),
  );
  if (process.argv.includes("--validation-only")) return;

  const artifact: PackedLocalModel = { version: 1, classifiers: packed };
  const model: LocalModel | undefined = unpackLocalModel(artifact);
  if (!model) throw new Error("Invalid packaged model.");
  const holdout = records.filter(({ split }) => split === "holdout");
  const evaluated = holdout.map((row) => {
    const review = reviewById.get(row.id);
    return {
      row: review ? { ...row, labels: review.labels } : row,
      rules: analyzePost(row.input, modelPatterns),
      hybrid: analyzePost(row.input, modelPatterns, model),
    };
  });
  const partitions = {
    all: evaluated,
    synthetic: evaluated.filter(({ row }) => row.source === "synthetic"),
    humanUnselected: evaluated.filter(
      ({ row }) => row.sampling === "unselected",
    ),
    humanTargeted: evaluated.filter(
      ({ row }) => row.source !== "synthetic" && row.sampling === "targeted",
    ),
  };
  const holdoutMetrics = Object.fromEntries(
    Object.entries(partitions).map(([name, entries]) => [
      name,
      modelPatterns.map((id) => ({
        pattern: id,
        ...Object.fromEntries(
          (["rules", "hybrid"] as const).map((mode) => [
            mode,
            metrics(
              entries.map(({ row, ...results }) => ({
                expected: expectedLabel(row, id),
                flagged: results[mode].some(
                  ({ patternId, confidenceLevel }) =>
                    patternId === id &&
                    confidenceLevel !== "insufficient_context",
                ),
              })),
            ),
          ]),
        ),
      })),
    ]),
  );
  for (let warm = 0; warm < 3; warm++) {
    for (const { input } of holdout) analyzePost(input, modelPatterns, model);
  }
  const timings = [];
  for (let repeat = 0; repeat < 8; repeat++) {
    for (const { input } of holdout) {
      const start = performance.now();
      analyzePost(input, modelPatterns, model);
      timings.push(performance.now() - start);
    }
  }
  timings.sort((a, b) => a - b);
  const output = JSON.stringify(artifact, null, 2) + "\n";
  const report = {
    train: train.length,
    validation: validation.length,
    holdout: holdout.length,
    reviewedHoldout: reviews.length,
    tuning,
    holdoutMetrics,
    artifactBytes: Buffer.byteLength(output),
    timing: {
      cpu: cpus()[0]?.model.trim(),
      node: process.version,
      samples: timings.length,
      p95Ms: round(timings[Math.ceil(timings.length * 0.95) - 1]!),
    },
  };
  const reportDir = new URL("../../.output/", import.meta.url);
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(
    new URL("pilot-model-evaluation.json", reportDir),
    JSON.stringify(report, null, 2) + "\n",
  );
  writeFileSync(
    new URL("../../src/data/local-model.json", import.meta.url),
    output,
  );
  console.log(
    JSON.stringify(
      {
        holdout: report.holdout,
        reviewedHoldout: report.reviewedHoldout,
        all: holdoutMetrics["all"],
        artifactBytes: report.artifactBytes,
        timing: report.timing,
      },
      null,
      2,
    ),
  );
}

await main();
