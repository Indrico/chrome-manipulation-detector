import { randomInt, randomUUID } from "node:crypto";
import {
  linkSync,
  mkdirSync,
  renameSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  code,
  judgment,
  loadPilotRecords,
  loadPilotReviews,
  patterns,
  readJsonl,
  recordSchema,
  reviewInputHash,
  summarize,
  text,
  type PilotRecord,
  type Review,
} from "./validate.ts";

const batchSchema = z.enum(["calibration", "fixed", "targeted"]);
type Batch = z.output<typeof batchSchema>;
const keySchema = z.strictObject({
  reviewId: code,
  id: code,
  inputHash: z.hash("sha256"),
});
type Key = z.output<typeof keySchema>;
type Item = { key: Key; record: PilotRecord };

const pattern = z.enum(patterns);
export const decisionSchema = z.strictObject({
  reviewId: code,
  judgments: z.record(pattern, z.enum(["absent", ...judgment.options])),
  quotes: z.partialRecord(pattern, text),
  rationale: text,
});
type Decision = z.output<typeof decisionSchema>;

function selectCalibration(records: readonly PilotRecord[]) {
  const validation = records.filter(({ split }) => split === "validation");
  const selected: PilotRecord[] = [];
  function take(count: number, candidates: PilotRecord[]) {
    const remaining = candidates.filter((row) => !selected.includes(row));
    const groups = new Set<string>();
    const distinct = remaining.filter((row) => {
      if (groups.has(row.groupId)) return false;
      groups.add(row.groupId);
      return true;
    });
    const ordered = [
      ...distinct,
      ...remaining.filter((row) => !distinct.includes(row)),
    ];
    if (ordered.length < count)
      throw new Error("Not enough calibration examples.");
    selected.push(...ordered.slice(0, count));
  }

  for (const id of patterns) {
    take(
      4,
      validation.filter(({ labels }) => labels[id]?.judgment === "present"),
    );
  }
  take(
    6,
    validation.filter(({ labels }) =>
      Object.values(labels).some((label) => label.judgment !== "present"),
    ),
  );
  take(
    12,
    validation.filter(({ labels }) => Object.keys(labels).length === 0),
  );
  return selected;
}

export function selectBatch(
  batch: Batch,
  records: readonly PilotRecord[],
  reviews: readonly Review[],
) {
  if (batch === "calibration") return selectCalibration(records);

  const holdout = records.filter(({ split }) => split === "holdout");
  const synthetic = holdout.filter(({ source }) => source === "synthetic");
  const unselected = holdout.filter(
    ({ sampling }) => sampling === "unselected",
  );
  if (synthetic.length !== 140 || unselected.length !== 200) {
    throw new Error(
      "Expected 140 synthetic and 200 unselected holdout examples.",
    );
  }
  const fixed = [...synthetic, ...unselected];
  if (batch === "fixed") return fixed;

  const reviewed = new Set(reviews.map(({ id }) => id));
  if (fixed.some(({ id }) => !reviewed.has(id))) {
    throw new Error(
      "Finalize the 340 fixed examples before preparing targeted review.",
    );
  }
  const targeted = holdout.filter(
    ({ source, sampling }) => source !== "synthetic" && sampling === "targeted",
  );
  if (targeted.length !== 160)
    throw new Error("Expected 160 targeted holdout examples.");
  return targeted;
}

export function createPacket(records: readonly PilotRecord[]) {
  const shuffled = [...records];
  for (let size = shuffled.length; size > 1; size--) {
    const other = randomInt(size);
    [shuffled[size - 1], shuffled[other]] = [
      shuffled[other]!,
      shuffled[size - 1]!,
    ];
  }
  return shuffled.map((record) => ({
    record,
    key: {
      reviewId: `review-${randomUUID()}`,
      id: record.id,
      inputHash: reviewInputHash(record),
    },
  }));
}

export function blindRow({ key, record }: Item) {
  return {
    reviewId: key.reviewId,
    language: record.language,
    input: record.input,
  };
}

function checkPacket(keys: readonly Key[], expected: readonly PilotRecord[]) {
  const records = new Map(expected.map((row) => [row.id, row]));
  const ids = new Set(keys.map(({ id }) => id));
  const reviewIds = new Set(keys.map(({ reviewId }) => reviewId));
  if (
    ids.size !== expected.length ||
    ids.size !== keys.length ||
    reviewIds.size !== keys.length
  ) {
    throw new Error("Review key count or uniqueness does not match the batch.");
  }
  return keys.map((key) => {
    const record = records.get(key.id);
    if (!record || reviewInputHash(record) !== key.inputHash) {
      throw new Error(`Review packet is outdated at ${key.reviewId}.`);
    }
    return { key, record };
  });
}

function grade({ key, record }: Item, decision: Decision) {
  const labels: PilotRecord["labels"] = {};
  for (const id of patterns) {
    const status = decision.judgments[id];
    const quote = decision.quotes[id];
    if (status !== "present" && quote !== undefined) {
      throw new Error(`Unexpected quote for ${id} at ${key.reviewId}.`);
    }
    if (status === "absent") continue;
    if (status !== "present") {
      labels[id] = { judgment: status };
      continue;
    }
    const start = quote === undefined ? -1 : record.input.text.indexOf(quote);
    if (
      quote === undefined ||
      start < 0 ||
      record.input.text.indexOf(quote, start + 1) !== -1
    ) {
      throw new Error(
        `Use a unique exact quote from the main text for ${id} at ${key.reviewId}.`,
      );
    }
    labels[id] = {
      judgment: status,
      evidence: { start, end: start + quote.length, text: quote },
    };
  }
  const checked = recordSchema.safeParse({
    ...record,
    labels,
    rationale: decision.rationale,
  });
  if (!checked.success) throw new Error(`Invalid decision at ${key.reviewId}.`);
  return { labels, rationale: checked.data.rationale };
}

function readGrades(items: readonly Item[], decisions: readonly Decision[]) {
  const expected = new Map(items.map((item) => [item.key.reviewId, item]));
  const grades = new Map<string, ReturnType<typeof grade>>();
  for (const decision of decisions) {
    const item = expected.get(decision.reviewId);
    if (!item || grades.has(decision.reviewId)) {
      throw new Error(`Unknown or duplicate decision at ${decision.reviewId}.`);
    }
    grades.set(decision.reviewId, grade(item, decision));
  }
  if (grades.size !== items.length) {
    throw new Error(
      `Expected ${items.length} decisions, found ${grades.size}.`,
    );
  }
  return grades;
}

export function compareDecisions(
  items: readonly Item[],
  first: readonly Decision[],
  second: readonly Decision[],
) {
  const left = readGrades(items, first);
  const right = readGrades(items, second);
  const disagreements = items.filter(
    ({ key }) =>
      JSON.stringify(left.get(key.reviewId)!.labels) !==
      JSON.stringify(right.get(key.reviewId)!.labels),
  );
  return { left, disagreements };
}

export function finalizeDecisions(
  items: readonly Item[],
  reviewerCodes: [string, string],
  first: readonly Decision[],
  second: readonly Decision[],
  resolutions: readonly Decision[],
): Review[] {
  if (reviewerCodes[0] === reviewerCodes[1])
    throw new Error("Two distinct reviewer codes are required.");
  const { left, disagreements } = compareDecisions(items, first, second);
  const agreed = readGrades(disagreements, resolutions);
  return items.map(({ key }) => ({
    id: key.id,
    inputHash: key.inputHash,
    reviewers: reviewerCodes,
    agreed: true,
    ...(agreed.get(key.reviewId) ?? left.get(key.reviewId)!),
  }));
}

const workspace = new URL("local/review/", import.meta.url);
const jsonl = (rows: readonly unknown[]) =>
  rows.map((row) => JSON.stringify(row)).join("\n") + "\n";

function prepare(batch: Batch, records: readonly PilotRecord[]) {
  mkdirSync(workspace, { recursive: true });
  const temporary = new URL(`.prepare-${randomUUID()}/`, workspace);
  mkdirSync(temporary);
  const packet = createPacket(records);
  const artifacts = [
    ["packet.jsonl", packet.map(blindRow)],
    ["key.jsonl", packet.map(({ key }) => key)],
    [
      "worksheet.jsonl",
      packet.map(({ key }) => ({
        reviewId: key.reviewId,
        judgments: Object.fromEntries(patterns.map((id) => [id, null])),
        quotes: {},
        rationale: "",
      })),
    ],
  ] as const;
  try {
    for (const [name, rows] of artifacts) {
      writeFileSync(new URL(name, temporary), jsonl(rows), { flag: "wx" });
    }
    renameSync(temporary, new URL(`${batch}/`, workspace));
  } catch (error) {
    for (const [name] of artifacts) {
      rmSync(new URL(name, temporary), { force: true });
    }
    rmdirSync(temporary);
    throw error;
  }
  console.log(`Prepared ${records.length} examples in local/review/${batch}/.`);
}

function main() {
  const [command, batchName, ...args] = process.argv.slice(2);
  const batch = batchSchema.parse(batchName);
  const records = loadPilotRecords();
  const reviews = loadPilotReviews();
  summarize(records, reviews);
  const expected = selectBatch(batch, records, reviews);
  if (command === "prepare" && args.length === 0) {
    prepare(batch, expected);
    return;
  }
  if ((command !== "compare" && command !== "finalize") || args.length !== 2) {
    throw new Error(
      "Usage: dataset:review -- prepare <batch> or compare/finalize <batch> <reviewer-a> <reviewer-b>.",
    );
  }
  if (command === "finalize" && batch === "calibration") {
    throw new Error(
      "Calibration can be compared without recording holdout reviews.",
    );
  }
  const [firstCode, secondCode] = z.tuple([code, code]).parse(args);
  if (firstCode === secondCode)
    throw new Error("Two distinct reviewer codes are required.");

  const prefix = `local/review/${batch}/`;
  const items = checkPacket(
    readJsonl(`${prefix}key.jsonl`, keySchema),
    expected,
  );
  const first = readJsonl(`${prefix}${firstCode}.jsonl`, decisionSchema);
  const second = readJsonl(`${prefix}${secondCode}.jsonl`, decisionSchema);
  if (command === "compare") {
    const { disagreements } = compareDecisions(items, first, second);
    console.log(
      JSON.stringify(
        {
          examples: items.length,
          agreed: items.length - disagreements.length,
          disagreements: disagreements.map(({ key }) => key.reviewId),
        },
        null,
        2,
      ),
    );
    return;
  }

  const resolutions = readJsonl(
    `${prefix}resolutions.jsonl`,
    decisionSchema,
    true,
  );
  const accepted = finalizeDecisions(
    items,
    [firstCode, secondCode],
    first,
    second,
    resolutions,
  );
  const report = summarize(records, [...reviews, ...accepted]);
  const directory = new URL(`${batch}/`, workspace);
  const temporary = new URL(`.accepted-${randomUUID()}.jsonl`, directory);
  try {
    writeFileSync(temporary, jsonl(accepted), { flag: "wx" });
    linkSync(temporary, new URL("accepted.jsonl", directory));
  } finally {
    rmSync(temporary, { force: true });
  }
  console.log(JSON.stringify(report, null, 2));
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Review failed.");
    process.exitCode = 1;
  }
}
