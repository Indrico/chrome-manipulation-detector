import type { PatternId } from "../models/pattern";

export const patternNames = {
  "ad-hominem": "Ad Hominem",
  "false-dilemma": "Dilema palsu",
  "guilt-tripping": "Tekanan rasa bersalah",
} as const satisfies Partial<Record<PatternId, string>>;

export type SupportedPatternId = keyof typeof patternNames;

export const supportedPatternIds: readonly SupportedPatternId[] = [
  "ad-hominem",
  "false-dilemma",
  "guilt-tripping",
];
