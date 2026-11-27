import { runnerImport } from "vite";
import { z } from "zod";
import type { PatternId } from "../src/models/pattern";

const {
  module: { detectionFixtures },
} = await runnerImport<typeof import("../tests/support/detection-fixtures.ts")>(
  "tests/support/detection-fixtures.ts",
);
const {
  module: { analyzePost },
} = await runnerImport<typeof import("../src/core/detection-engine.ts")>(
  "src/core/detection-engine.ts",
);
const {
  module: { supportedPatternIds: categories },
} = await runnerImport<typeof import("../src/data/patterns.ts")>(
  "src/data/patterns.ts",
);
const {
  module: { handleOnlineRequest, models },
} = await runnerImport<typeof import("./index.ts")>("worker/index.ts");
const {
  module: {
    onlineBatchSize,
    onlineResultsSchema,
    onlineTimeoutMs,
    toOnlineDetections,
    maskIdentifiers,
  },
} = await runnerImport<typeof import("../src/online/protocol.ts")>(
  "src/online/protocol.ts",
);

const holdout = detectionFixtures.filter(({ split }) => split === "holdout");
const positives = (
  results: { patternId: PatternId; confidenceLevel: string }[],
) =>
  new Set(
    results
      .filter(
        ({ confidenceLevel }) => confidenceLevel !== "insufficient_context",
      )
      .map(({ patternId }) => patternId),
  );
const quantile = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];

function summarize(predictions: (Set<PatternId> | null)[]) {
  return [...categories, "all" as const].map((category) => {
    let tp = 0,
      fp = 0,
      fn = 0;
    for (const [index, { expected, group }] of holdout.entries()) {
      if (group === "ambiguous") continue;
      const flags = predictions[index];
      for (const id of category === "all" ? categories : [category]) {
        const expectedFlag =
          expected[id] === "possible" || expected[id] === "likely";
        if (flags?.has(id)) {
          if (expectedFlag) tp++;
          else fp++;
        } else if (expectedFlag) fn++;
      }
    }
    return {
      category,
      tp,
      fp,
      fn,
      precision: tp + fp ? tp / (tp + fp) : null,
      recall: tp + fn ? tp / (tp + fn) : null,
    };
  });
}

const timings: number[] = [];
const local = holdout.map(({ input }) => {
  const start = performance.now();
  const result = positives(analyzePost(input));
  timings.push(performance.now() - start);
  return result;
});
console.log({
  model: "local-rules",
  syntheticPosts: holdout.length,
  p95MsPerPost: quantile(timings),
});
console.table(summarize(local));
if (!process.argv.includes("--local")) {
  const { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token } =
    process.env;
  if (!account || !/^[a-f0-9]{32}$/i.test(account) || !token)
    throw new Error(
      "Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN for the Workers AI comparison.",
    );
  const envelope = z.object({
    result: z.looseObject({
      usage: z
        .object({ prompt_tokens: z.number(), completion_tokens: z.number() })
        .optional(),
    }),
  });
  const selection = process.argv
    .find((argument) => argument.startsWith("--model="))
    ?.slice("--model=".length);
  const selectedModels = selection
    ? models.filter((model) => model === selection)
    : models;
  if (!selectedModels.length) throw new Error("Unknown Workers AI model.");
  for (const model of selectedModels) {
    const predictions: (Set<PatternId> | null)[] = [];
    let batches = 0,
      failedBatches = 0,
      tokenReports = 0,
      inputTokens = 0,
      outputTokens = 0;
    const durations: number[] = [];
    for (let start = 0; start < holdout.length; start += onlineBatchSize) {
      const posts = holdout
        .slice(start, start + onlineBatchSize)
        .map(({ input }) => ({
          text: maskIdentifiers(input.text),
          ...(input.context?.[0] && {
            context: maskIdentifiers(input.context[0].text),
          }),
        }));
      const batch = { categories: [...categories], posts };
      const began = performance.now();
      const response = await handleOnlineRequest(
        new Request("https://benchmark.invalid/v1/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(batch),
        }),
        {
          LLM_MODEL: model,
          RATE_LIMITER: { limit: async () => ({ success: true }) },
          AI: {
            async run(model, input) {
              batches++;
              const reply = await fetch(
                `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`,
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify(input),
                  signal: AbortSignal.timeout(onlineTimeoutMs),
                },
              );
              if (!reply.ok) throw new Error(`Provider status ${reply.status}`);
              const { result } = envelope.parse(await reply.json());
              if (result.usage) {
                tokenReports++;
                inputTokens += result.usage.prompt_tokens;
                outputTokens += result.usage.completion_tokens;
              }
              return result;
            },
          },
        },
      );
      durations.push(performance.now() - began);
      const output = onlineResultsSchema.safeParse(await response.json()).data;
      if (
        !output ||
        output.results.length !== posts.length ||
        output.results.every((item) => item === null)
      )
        failedBatches++;
      for (const index of posts.keys()) {
        const matches = output?.results[index];
        const valid = matches && toOnlineDetections(batch, index, matches);
        predictions.push(valid ? positives(valid) : null);
      }
    }
    console.log({
      model,
      batches,
      failedBatches,
      failedPosts: predictions.filter((result) => result === null).length,
      p95MsPerBatch: quantile(durations),
      tokenReports,
      inputTokens: tokenReports ? inputTokens : null,
      outputTokens: tokenReports ? outputTokens : null,
    });
    console.table(summarize(predictions));
  }
}
