import type { PatternId } from "../models/pattern";

export const patternNames = {
  "ad-hominem": "Ad Hominem",
  "false-dilemma": "Dilema palsu",
  "guilt-tripping": "Tekanan rasa bersalah",
  "appeal-to-authority": "Banding pada otoritas",
  "loaded-questions": "Pertanyaan bermuatan",
  "false-urgency": "Urgensi palsu",
  whataboutism: "Whataboutism",
  strawman: "Strawman",
} as const satisfies Record<PatternId, string>;

export const supportedPatternIds = Object.keys(
  patternNames,
) as readonly PatternId[];
export const contextualPatterns: readonly PatternId[] = [
  "whataboutism",
  "strawman",
];
