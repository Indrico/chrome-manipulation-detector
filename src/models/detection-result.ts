import { z } from "zod";
import { patternIdSchema } from "./pattern";

export const confidenceLevelSchema = z.enum([
  "possible",
  "likely",
  "insufficient_context",
]);

export const textSpanSchema = z
  .strictObject({
    start: z.int().nonnegative(),
    end: z.int().positive(),
  })
  .refine(({ start, end }) => end > start);

export const detectionResultSchema = z
  .strictObject({
    patternId: patternIdSchema,
    patternName: z.string().min(1),
    confidenceLevel: confidenceLevelSchema,
    matchedText: z.string().min(1),
    span: textSpanSchema,
    explanation: z.string().min(1),
    evidence: z.array(z.string().min(1)).min(1),
    limitations: z.array(z.string().min(1)).min(1).optional(),
  })
  .refine(
    ({ span, matchedText }) => span.end - span.start === matchedText.length,
  )
  .refine(
    ({ confidenceLevel, limitations }) =>
      confidenceLevel !== "insufficient_context" || !!limitations,
  );

export type DetectionResult = z.infer<typeof detectionResultSchema>;
export type TextSpan = z.infer<typeof textSpanSchema>;
