import { z } from "zod";
import { confidenceLevelSchema } from "../../src/models/detection-result";
import { patternIdSchema } from "../../src/models/pattern";
import fixtures from "../fixtures/phase-2.json";

const fixtureSchema = z.strictObject({
  id: z.string().min(1),
  target: patternIdSchema,
  group: z.enum([
    "positive",
    "negative",
    "ambiguous",
    "educational",
    "context",
  ]),
  split: z.enum(["development", "holdout"]),
  language: z.enum(["id", "mixed", "en"]),
  input: z.strictObject({
    text: z.string().min(1),
    context: z
      .array(
        z.strictObject({
          source: z.enum(["quoted_post", "reply_target"]),
          text: z.string().min(1),
        }),
      )
      .optional(),
  }),
  expected: z.partialRecord(patternIdSchema, confidenceLevelSchema),
  rationale: z.string().min(1),
});

export const phase2Fixtures = z.array(fixtureSchema).parse(fixtures);
