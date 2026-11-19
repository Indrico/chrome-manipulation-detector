import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { z } from "zod";

export const patterns = [
  "ad-hominem",
  "false-dilemma",
  "guilt-tripping",
] as const;
const splits = ["train", "validation", "holdout"] as const;
const sources = ["synthetic", "contribution", "licensed"] as const;
const targets = {
  synthetic: { train: 540, validation: 120, holdout: 140 },
  human: { train: 660, validation: 180, holdout: 360 },
};
export const code = z.string().regex(/^[a-z0-9][a-z0-9-]{2,79}$/);
export const text = z
  .string()
  .min(1)
  .max(10_000)
  .refine((value) => !!value.trim());
const evidence = z.strictObject({
  start: z.int().nonnegative(),
  end: z.int().positive(),
  text,
});
export const judgment = z.enum([
  "present",
  "ambiguous",
  "insufficient_context",
]);
const labels = z.partialRecord(
  z.enum(patterns),
  z.strictObject({ judgment, evidence: evidence.optional() }),
);
const attribution = z.strictObject({
  dataset: text,
  publisher: text,
  license: text,
  url: z.url({ protocol: /^https$/ }),
  revision: text,
  reference: code,
});
const fields = {
  id: code,
  groupId: code,
  split: z.enum(splits),
  language: z.enum(["id", "mixed", "en"]),
  sampling: z.enum(["targeted", "unselected"]),
  input: z.strictObject({
    text,
    context: z
      .array(
        z.strictObject({
          source: z.enum(["quoted_post", "reply_target"]),
          text,
        }),
      )
      .min(1)
      .max(2)
      .optional(),
  }),
  labels,
  rationale: text,
};

export const recordSchema = z
  .discriminatedUnion("source", [
    z.strictObject({ ...fields, source: z.literal("synthetic") }),
    z.strictObject({
      ...fields,
      source: z.literal("contribution"),
      permission: z.strictObject({
        reference: code,
        directSubmission: z.literal(true),
        training: z.literal(true),
        evaluation: z.literal(true),
        publication: z.boolean(),
      }),
    }),
    z.strictObject({
      ...fields,
      source: z.literal("licensed"),
      attribution,
    }),
  ])
  .superRefine((row, ctx) => {
    if (
      row.sampling === "unselected" &&
      (row.source === "synthetic" || row.split !== "holdout")
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["sampling"],
        message: "Unselected examples must be human-written holdout records.",
      });
    }
    const inputTexts = [
      row.input.text,
      ...(row.input.context?.map((item) => item.text) ?? []),
      row.rationale,
    ];
    if (
      inputTexts.some((value) =>
        /https?:\/\/|www\.|[\p{L}\p{N}._%+-]*@[\p{L}\p{N}_]/iu.test(value),
      )
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["input"],
        message: "Remove URLs, email addresses, and account handles.",
      });
    }
    for (const [pattern, label] of Object.entries(row.labels)) {
      const span = label.evidence;
      if (
        (label.judgment === "present" && !span) ||
        (span &&
          (span.start >= span.end ||
            span.end > row.input.text.length ||
            row.input.text.slice(span.start, span.end) !== span.text))
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["labels", pattern, "evidence"],
          message: "Provide a matching UTF-16 span in the main text.",
        });
      }
    }
  });

export const reviewSchema = z
  .strictObject({
    id: code,
    reviewers: z.tuple([code, code]),
    agreed: z.literal(true),
    inputHash: z.hash("sha256"),
    labels,
    rationale: text,
  })
  .refine(({ reviewers }) => reviewers[0] !== reviewers[1], {
    path: ["reviewers"],
    message: "Two distinct reviewers are required.",
  });

export type PilotRecord = z.output<typeof recordSchema>;
export type Review = z.output<typeof reviewSchema>;

export function reviewInputHash({ id, language, input }: PilotRecord) {
  return createHash("sha256")
    .update(JSON.stringify({ id, language, input }))
    .digest("hex");
}

export function readJsonl<T>(
  name: string,
  schema: z.ZodType<T>,
  optional = false,
): T[] {
  const file = new URL(name, import.meta.url);
  let contents: string;
  try {
    contents = readFileSync(file, "utf8");
  } catch (error) {
    if (optional && (error as NodeJS.ErrnoException).code === "ENOENT")
      return [];
    throw error;
  }

  return contents.split(/\r?\n/u).flatMap((line, index) => {
    if (!line.trim()) return [];
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error(`${name} line ${index + 1} has invalid JSON.`);
    }
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      const fields = parsed.error.issues.map(
        ({ path }) => path.join(".") || "(record)",
      );
      throw new Error(
        `${name} line ${index + 1} has invalid fields: ${fields.join(", ")}.`,
      );
    }
    return [parsed.data];
  });
}

export function summarize(
  records: readonly PilotRecord[],
  reviews: readonly Review[],
) {
  const ids = new Set<string>();
  const texts = new Set<string>();
  const groups = new Map<string, PilotRecord["split"]>();
  const holdout = new Set<string>();
  const reviewed = new Map<string, Review>();
  for (const review of reviews) {
    if (reviewed.has(review.id))
      throw new Error(`Duplicate holdout review at ${review.id}.`);
    reviewed.set(review.id, review);
  }
  const counts = {
    synthetic: { train: 0, validation: 0, holdout: 0 },
    contribution: { train: 0, validation: 0, holdout: 0 },
    licensed: { train: 0, validation: 0, holdout: 0 },
  };
  const positives = {
    "ad-hominem": 0,
    "false-dilemma": 0,
    "guilt-tripping": 0,
  };
  const reviewedPositives = { ...positives };
  let unselected = 0;

  for (const row of records) {
    const normalized = row.input.text
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
    if (ids.has(row.id) || texts.has(normalized))
      throw new Error(`Duplicate example at ${row.id}.`);
    ids.add(row.id);
    texts.add(normalized);

    const previous = groups.get(row.groupId);
    if (previous && previous !== row.split)
      throw new Error(`Group spans splits at ${row.id}.`);
    groups.set(row.groupId, row.split);
    counts[row.source][row.split]++;

    if (row.split !== "holdout") continue;
    holdout.add(row.id);
    if (row.sampling === "unselected") unselected++;
    const review = reviewed.get(row.id);
    if (review && review.inputHash !== reviewInputHash(row)) {
      throw new Error(`Holdout input changed after review at ${row.id}.`);
    }
    const labels = review
      ? recordSchema.parse({
          ...row,
          labels: review.labels,
          rationale: review.rationale,
        }).labels
      : row.labels;
    for (const pattern of patterns) {
      if (labels[pattern]?.judgment === "present") {
        positives[pattern]++;
        if (review) reviewedPositives[pattern]++;
      }
    }
  }

  for (const id of reviewed.keys()) {
    if (!holdout.has(id)) throw new Error(`Unknown holdout review at ${id}.`);
  }

  const humanCount = (split: PilotRecord["split"]) =>
    counts.contribution[split] + counts.licensed[split];
  for (const split of splits) {
    if (counts.synthetic[split] !== targets.synthetic[split]) {
      throw new Error(`Unexpected synthetic quota for ${split}.`);
    }
    if (humanCount(split) > targets.human[split]) {
      throw new Error(`Human-written records exceed the quota for ${split}.`);
    }
  }
  if (unselected > 200 || humanCount("holdout") - unselected > 160) {
    throw new Error("Human-written holdout records exceed the sampling quota.");
  }

  const missingHumanExamples = splits.reduce(
    (sum, split) => sum + targets.human[split] - humanCount(split),
    0,
  );
  const ready =
    missingHumanExamples === 0 &&
    unselected === 200 &&
    patterns.every((pattern) => reviewedPositives[pattern] >= 80) &&
    reviewed.size === 500;

  return {
    counts,
    missingHumanExamples,
    holdoutPositivesByCategory: positives,
    reviewedHoldoutPositivesByCategory: reviewedPositives,
    unselectedHumanHoldout: unselected,
    reviewedHoldout: reviewed.size,
    ready,
  };
}

export function loadPilotRecords() {
  return sources.flatMap((source) => {
    const name =
      source === "synthetic" ? "synthetic.jsonl" : `local/${source}.jsonl`;
    const rows = readJsonl(name, recordSchema, source !== "synthetic");
    if (rows.some((row) => row.source !== source)) {
      throw new Error(`Unexpected source in ${name}.`);
    }
    return rows;
  });
}

export function loadPilotReviews() {
  return ["fixed", "targeted"].flatMap((batch) =>
    readJsonl(`local/review/${batch}/accepted.jsonl`, reviewSchema, true),
  );
}

function main() {
  const report = summarize(loadPilotRecords(), loadPilotReviews());
  console.log(JSON.stringify(report, null, 2));
  if (process.argv.includes("--require-complete") && !report.ready)
    process.exitCode = 1;
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  try {
    main();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Dataset validation failed.",
    );
    process.exitCode = 1;
  }
}
