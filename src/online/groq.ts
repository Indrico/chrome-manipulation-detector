import { z } from "zod";
import { groqOrigin } from "./config";
import { alignModelResults, completionContent, modelMessages } from "./model";
import { onlineTimeoutMs, type OnlineBatch } from "./protocol";

const groqMatches = z.array(
  z.strictObject({
    patternId: z.string(),
    confidenceLevel: z.enum(["possible", "insufficient_context"]),
    matchedText: z.string(),
    explanation: z.string(),
  }),
);
const outputFormat = `Keluarkan hanya satu objek JSON dengan kunci "post_0", "post_1", dan seterusnya sesuai index unggahan yang diberikan. Nilai setiap kunci berupa daftar temuan untuk index tersebut, atau [] jika tidak ada bukti spesifik. Setiap temuan berisi patternId, confidenceLevel, matchedText, dan explanation dalam bahasa Indonesia. Isi semua kunci yang diwajibkan skema.`;
const postKey = (index: number) => `post_${index}`;
const keyedResultsSchema = z.record(z.string(), z.unknown());
const generationErrorSchema = z.object({
  error: z.object({ code: z.literal("json_validate_failed") }),
});

export async function requestGroq(
  batch: OnlineBatch,
  apiKey: string,
  signal: AbortSignal,
) {
  const format = z.strictObject(
    Object.fromEntries(
      batch.posts.map((_, index) => [postKey(index), groqMatches]),
    ),
  );
  return fetch(`${groqOrigin}/openai/v1/chat/completions`, {
    method: "POST",
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-20b",
      messages: modelMessages(batch, outputFormat),
      max_completion_tokens: 3_000,
      temperature: 0.1,
      reasoning_effort: "low",
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "rhetorical_patterns",
          strict: true,
          schema: z.toJSONSchema(format, { target: "draft-7" }),
        },
      },
    }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(onlineTimeoutMs)]),
  });
}

export async function readGroqResults(batch: OnlineBatch, response: Response) {
  try {
    const content = completionContent(await response.json());
    const output = keyedResultsSchema.safeParse(JSON.parse(content ?? "null"));
    if (!output.success) return;
    return alignModelResults(batch, {
      results: batch.posts.map((_, index) => ({
        index,
        matches: output.data[postKey(index)],
      })),
    });
  } catch {
    return;
  }
}

export async function isGroqGenerationError(response: Response) {
  return generationErrorSchema.safeParse(
    await response.json().catch(() => null),
  ).success;
}
