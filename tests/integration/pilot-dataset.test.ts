import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  blindRow,
  compareDecisions,
  createPacket,
  decisionSchema,
  finalizeDecisions,
  selectBatch,
} from "../../datasets/manipulation-pilot/review.ts";
import {
  recordSchema,
  reviewInputHash,
  reviewSchema,
  summarize,
} from "../../datasets/manipulation-pilot/validate.ts";

const synthetic = readFileSync(
  new URL("../../datasets/manipulation-pilot/synthetic.jsonl", import.meta.url),
  "utf8",
)
  .trimEnd()
  .split(/\r?\n/u)
  .map((line) => recordSchema.parse(JSON.parse(line)));
const example = synthetic[0]!;

it("validates 800 synthetic entries in 80 groups and reports incomplete research data", () => {
  expect(new Set(synthetic.map(({ groupId }) => groupId)).size).toBe(80);
  expect(summarize(synthetic, [])).toMatchObject({
    counts: { synthetic: { train: 540, validation: 120, holdout: 140 } },
    holdoutPositivesByCategory: {
      "ad-hominem": 40,
      "false-dilemma": 30,
      "guilt-tripping": 40,
    },
    missingHumanExamples: 1_200,
    reviewedHoldout: 0,
    ready: false,
  });
});

it("requires main-text evidence and checks obvious identifying content", () => {
  const input = { text: "🙂 Teks bukti" };
  const labels = {
    "ad-hominem": {
      judgment: "present",
      evidence: { start: 3, end: input.text.length, text: "Teks bukti" },
    },
  };
  expect(recordSchema.safeParse({ ...example, input, labels }).success).toBe(
    true,
  );
  expect(
    recordSchema.safeParse({
      ...example,
      input,
      labels: { "ad-hominem": { judgment: "present" } },
    }).success,
  ).toBe(false);
  expect(
    recordSchema.safeParse({
      ...example,
      input: { ...input, context: [{ source: "quoted_post", text: "@nama" }] },
      labels,
    }).success,
  ).toBe(false);
});

it("requires permission or source attribution according to how the text was obtained", () => {
  expect(
    recordSchema.safeParse({ ...example, source: "contribution" }).success,
  ).toBe(false);
  expect(
    recordSchema.safeParse({ ...example, source: "licensed" }).success,
  ).toBe(false);
  expect(
    recordSchema.safeParse({
      ...example,
      source: "licensed",
      attribution: {
        dataset: "Corpus",
        publisher: "Example publisher",
        license: "CC-BY-4.0",
        url: "https://example.org/dataset",
        revision: "1.0",
        reference: "row-001",
      },
    }).success,
  ).toBe(true);
});

it("rejects duplicate text, group leakage, and repeated review codes", () => {
  const records = [...synthetic];
  records[1] = {
    ...records[1]!,
    input: { text: example.input.text.toUpperCase() },
  };
  expect(() => summarize(records, [])).toThrow(/Duplicate example/);
  records[1] = { ...synthetic[1]!, split: "validation" };
  expect(() => summarize(records, [])).toThrow(/Group spans splits/);
  expect(
    reviewSchema.safeParse({
      id: "syn-holdout-a21-01",
      reviewers: ["reviewer-a", "reviewer-a"],
      agreed: true,
      inputHash: reviewInputHash(example),
      labels: {},
      rationale: "Test rationale.",
    }).success,
  ).toBe(false);
});

it("keeps the readiness gate closed until the full holdout has independent review records", () => {
  const quotas = { train: 660, validation: 180, holdout: 360 } as const;
  const patterns = ["ad-hominem", "false-dilemma", "guilt-tripping"] as const;
  const human = Object.entries(quotas).flatMap(([split, count]) =>
    Array.from({ length: count }, (_, index) => {
      const unselected = split === "holdout" && index < 200;
      const text = `Test-only sample ${split} ${index}`;
      return recordSchema.parse({
        id: `test-${split}-${index}`,
        groupId: `test-${split}-${index}`,
        source: "contribution",
        split,
        language: "en",
        sampling: unselected ? "unselected" : "targeted",
        input: { text },
        labels:
          split === "holdout" && !unselected
            ? {
                [patterns[index % patterns.length]!]: {
                  judgment: "present",
                  evidence: { start: 0, end: text.length, text },
                },
              }
            : {},
        rationale: "Test fixture for completeness validation.",
        permission: {
          reference: "test-permission",
          directSubmission: true,
          training: true,
          evaluation: true,
          publication: false,
        },
      });
    }),
  );
  const records = [...synthetic, ...human];
  const reviews = records
    .filter(({ split }) => split === "holdout")
    .map((row) =>
      reviewSchema.parse({
        id: row.id,
        reviewers: ["reviewer-a", "reviewer-b"],
        agreed: true,
        inputHash: reviewInputHash(row),
        labels: row.labels,
        rationale: row.rationale,
      }),
    );
  expect(selectBatch("fixed", records, []).map(({ id }) => id)).toHaveLength(
    340,
  );
  expect(() => selectBatch("targeted", records, [])).toThrow(
    /Finalize the 340/,
  );
  expect(selectBatch("targeted", records, reviews)).toHaveLength(160);
  expect(summarize(records, reviews.slice(1)).ready).toBe(false);
  expect(summarize(records, reviews).ready).toBe(true);
  const draftsOnly = reviews.map((row) => ({ ...row, labels: {} }));
  expect(summarize(records, draftsOnly)).toMatchObject({
    reviewedHoldout: 500,
    holdoutPositivesByCategory: {
      "ad-hominem": 0,
      "false-dilemma": 0,
      "guilt-tripping": 0,
    },
    ready: false,
  });
  const changed = records.map((row) =>
    row.id === reviews[0]!.id
      ? { ...row, input: { text: `${row.input.text} Changed.` } }
      : row,
  );
  expect(() => summarize(changed, reviews)).toThrow(
    /input changed after review/,
  );
});

it("prepares an unlabeled 30-example calibration packet from validation", () => {
  const sample = selectBatch("calibration", synthetic, []);
  expect(sample).toHaveLength(30);
  expect(sample.every(({ split }) => split === "validation")).toBe(true);
  const packet = createPacket(sample).map(blindRow);
  expect(new Set(packet.map(({ reviewId }) => reviewId)).size).toBe(30);
  expect(packet.every((row) => Object.keys(row).length === 3)).toBe(true);
  expect(packet[0]).toHaveProperty("input.text");
});

it("compares independent decisions and requires a resolution before accepting differences", () => {
  const row = recordSchema.parse({
    ...example,
    input: { text: "🙂 Teks bukti" },
    labels: {},
  });
  const items = createPacket([row]);
  const first = decisionSchema.parse({
    reviewId: items[0]!.key.reviewId,
    judgments: {
      "ad-hominem": "present",
      "false-dilemma": "absent",
      "guilt-tripping": "absent",
    },
    quotes: { "ad-hominem": "Teks bukti" },
    rationale: "Test rationale.",
  });
  const second = decisionSchema.parse({
    ...first,
    judgments: { ...first.judgments, "ad-hominem": "ambiguous" },
    quotes: {},
  });
  const reviewers: [string, string] = ["reviewer-a", "reviewer-b"];
  expect(compareDecisions(items, [first], [second]).disagreements).toHaveLength(
    1,
  );
  expect(() =>
    finalizeDecisions(items, reviewers, [first], [second], []),
  ).toThrow(/Expected 1 decisions/);
  const [resolved] = finalizeDecisions(
    items,
    reviewers,
    [first],
    [second],
    [first],
  );
  expect(reviewSchema.parse(resolved)).toMatchObject({
    reviewers,
    labels: {
      "ad-hominem": { evidence: { start: 3, end: 13, text: "Teks bukti" } },
    },
  });
  expect(() => compareDecisions(items, [first, first], [second])).toThrow(
    /duplicate/,
  );
  expect(() =>
    compareDecisions(
      items,
      [{ ...first, quotes: { "ad-hominem": "Missing" } }],
      [second],
    ),
  ).toThrow(/exact quote/);
  expect(
    decisionSchema.safeParse({
      ...first,
      judgments: { "ad-hominem": "present" },
    }).success,
  ).toBe(false);
});
