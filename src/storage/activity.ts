import { z } from "zod";
import { patternIdSchema } from "../models/pattern";

export const totalsKey = "sessionTotals";
export const feedbackKey = "feedback";

const count = z.int().nonnegative();
const totalsSchema = z.strictObject({ posts: count, patterns: count });
export type SessionTotals = z.infer<typeof totalsSchema>;

export function readTotals(value: unknown): SessionTotals {
  return totalsSchema.safeParse(value).data ?? { posts: 0, patterns: 0 };
}

const reasonSchema = z.enum([
  "false_positive",
  "missing_context",
  "unclear",
  "helpful",
]);
export type FeedbackReason = z.infer<typeof reasonSchema>;

export const feedbackReasons: Readonly<Record<FeedbackReason, string>> = {
  false_positive: "Deteksi keliru",
  missing_context: "Konteks terlewat",
  unclear: "Penjelasan kurang jelas",
  helpful: "Penjelasan membantu",
};
const feedbackEntrySchema = z.strictObject({
  patternId: patternIdSchema,
  reason: reasonSchema,
});
export type FeedbackEntry = z.infer<typeof feedbackEntrySchema>;
export const feedbackSchema = z
  .array(feedbackEntrySchema.extend({ count: z.int().positive() }))
  .max(32);
export type FeedbackRecord = z.infer<typeof feedbackSchema>[number];

export const contentMessageSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("totals:add"),
    posts: count,
    patterns: count,
  }),
  z.strictObject({
    type: z.literal("feedback:add"),
    entry: feedbackEntrySchema,
  }),
]);
export const clearFeedbackMessageSchema = z.strictObject({
  type: z.literal("feedback:clear"),
});
export const platformRequest = { type: "platform:status" } as const;
export const platformRequestSchema = z.strictObject({
  type: z.literal(platformRequest.type),
});
export const platformStatusSchema = z.enum([
  "active",
  "waiting",
  "paused",
  "unsupported",
]);
export type PlatformStatus = z.infer<typeof platformStatusSchema>;
export const platformResponseSchema = z.strictObject({
  platform: z.enum(["x", "threads"]),
  status: platformStatusSchema,
});
