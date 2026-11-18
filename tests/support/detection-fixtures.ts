import { z } from "zod";
import { confidenceLevelSchema } from "../../src/models/detection-result";
import { patternIdSchema } from "../../src/models/pattern";
import phase2 from "../fixtures/phase-2.json";
import phase4 from "../fixtures/phase-4.json";

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

export const detectionFixtures = z
  .array(fixtureSchema)
  .parse([...phase2, ...phase4]);
