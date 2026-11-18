import type { DetectionResult } from "./detection-result";
import type { DetectionContext } from "./post";

export type DetectionCandidate = Omit<
  DetectionResult,
  "patternId" | "patternName" | "matchedText"
>;
export type Detector = (
  context: DetectionContext,
) => Iterable<DetectionCandidate>;
