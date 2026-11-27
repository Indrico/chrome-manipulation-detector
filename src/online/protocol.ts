import { z } from "zod";
import { contextualPatterns, patternNames } from "../data/patterns";
import type { DetectionResult } from "../models/detection-result";
import { patternIdSchema } from "../models/pattern";

export const onlineBatchSize = 10;
export const onlineBatchDelayMs = 500;
export const onlineTimeoutMs = 10_000;
export const onlineDailyPosts = 30;
export const onlineTextLength = 1_600;
export const onlineContextLength = 800;
export const onlinePath = "/v1/analyze";
export const onlineStatusKey = "onlineStatus";
export const onlineUsageKey = "onlineUsage";

const nonblank = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((s) => !!s.trim());
const postSchema = z.strictObject({
  text: nonblank(onlineTextLength),
  context: nonblank(onlineContextLength).optional(),
});

export const onlineBatchSchema = z.strictObject({
  categories: z
    .array(patternIdSchema)
    .min(1)
    .max(8)
    .refine((ids) => new Set(ids).size === ids.length),
  posts: z.array(postSchema).min(1).max(onlineBatchSize),
});

export type OnlineBatch = z.infer<typeof onlineBatchSchema>;
export type OnlinePost = z.infer<typeof postSchema>;

export const onlineMessageSchema = z.strictObject({
  type: z.literal("online:analyze"),
  batch: onlineBatchSchema,
});

export const groqKeySchema = z.string().regex(/^[A-Za-z0-9_-]{16,256}$/u);
export const groqConnectionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("groq:connect"), key: groqKeySchema }),
  z.strictObject({ type: z.literal("groq:disconnect") }),
]);
export type GroqConnectionMessage = z.infer<typeof groqConnectionSchema>;

const matchSchema = z.strictObject({
  patternId: patternIdSchema,
  confidenceLevel: z.enum(["possible", "insufficient_context"]),
  matchedText: nonblank(onlineTextLength),
  explanation: nonblank(400),
});

const matchesSchema = z.array(matchSchema).max(8);
export const modelResultSchema = z.strictObject({
  index: z
    .int()
    .min(0)
    .max(onlineBatchSize - 1),
  matches: z
    .array(
      matchSchema.extend({
        confidenceLevel: z
          .enum(["possible", "likely", "certain", "insufficient_context"])
          .transform((level) =>
            level === "insufficient_context" ? level : ("possible" as const),
          ),
      }),
    )
    .max(8),
});

export const onlineResultsSchema = z.strictObject({
  results: z.array(matchesSchema.nullable()).min(1).max(onlineBatchSize),
});

export const onlineStatusSchema = z.strictObject({
  reason: z.enum([
    "daily_limit",
    "quota",
    "unavailable",
    "permission",
    "credential",
    "invalid_output",
    "partial",
  ]),
  retryAt: z.int().nonnegative(),
});

export const onlineReplySchema = z.union([
  onlineResultsSchema.extend({
    remainingStatus: onlineStatusSchema.optional(),
  }),
  z.strictObject({ status: onlineStatusSchema }),
  z.strictObject({ deferred: z.literal(true) }),
]);

export type OnlineReply = z.infer<typeof onlineReplySchema>;
export type OnlineStatus = z.infer<typeof onlineStatusSchema>;

export function maskIdentifiers(text: string) {
  return text.replace(
    /https?:\/\/[^\s<>]+|\b(?:www\.|(?:pic\.)?(?:x|twitter)\.com\/|t\.co\/)[^\s<>]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|@[\w]+/giu,
    (match) => "•".repeat(match.length),
  );
}

export function toOnlineDetections(
  batch: OnlineBatch,
  index: number,
  matches: z.infer<typeof matchesSchema>,
): Omit<DetectionResult, "matchedText">[] | null {
  const post = batch.posts[index];
  if (!post) return null;
  const seen = new Set<string>();
  const detections: Omit<DetectionResult, "matchedText">[] = [];
  for (const {
    patternId,
    confidenceLevel,
    matchedText,
    explanation,
  } of matches) {
    const start = post.text.indexOf(matchedText);
    if (
      !batch.categories.includes(patternId) ||
      seen.has(patternId) ||
      start < 0 ||
      !/\p{L}/u.test(matchedText)
    )
      return null;
    seen.add(patternId);
    const missing =
      confidenceLevel === "insufficient_context" ||
      (contextualPatterns.includes(patternId) && !post.context);
    detections.push({
      patternId,
      patternName: patternNames[patternId],
      confidenceLevel: missing ? "insufficient_context" : "possible",
      span: { start, end: start + matchedText.length },
      explanation: missing
        ? "Kutipan ini perlu dibandingkan dengan kritik atau klaim asli yang relevan."
        : explanation,
      evidence: ["Kutipan dari unggahan yang diperiksa oleh model online."],
      limitations: [
        missing
          ? "Konteks tidak cukup untuk menilai pola ini."
          : "Saran model online. Periksa kutipan dan konteksnya.",
      ],
    });
  }
  return detections;
}
