import { z } from "zod";

export const patternIdSchema = z.enum([
  "false-dilemma",
  "ad-hominem",
  "appeal-to-authority",
  "strawman",
  "whataboutism",
  "guilt-tripping",
  "loaded-questions",
  "false-urgency",
]);

export type PatternId = z.infer<typeof patternIdSchema>;
