import {
  detectionResultSchema,
  type DetectionResult,
} from "../models/detection-result";
import type { DetectionCandidate, Detector } from "../models/detector";
import type { PatternId } from "../models/pattern";
import type { PostInput } from "../models/post";
import {
  patternNames,
  supportedPatternIds,
  type SupportedPatternId,
} from "../data/patterns";
import { extractContext } from "./context-extractor";
import { detectAdHominem } from "../detectors/ad-hominem";
import { detectFalseDilemma } from "../detectors/false-dilemma";
import { detectGuiltTripping } from "../detectors/guilt-tripping";

const detectors: Readonly<Record<SupportedPatternId, Detector>> = {
  "ad-hominem": detectAdHominem,
  "false-dilemma": detectFalseDilemma,
  "guilt-tripping": detectGuiltTripping,
};

const confidenceOrder = ["insufficient_context", "possible", "likely"];

function strongest(
  candidates: Iterable<DetectionCandidate>,
): DetectionCandidate | undefined {
  let best: DetectionCandidate | undefined;
  for (const candidate of candidates) {
    const rank = confidenceOrder.indexOf(candidate.confidenceLevel);
    const bestRank = best ? confidenceOrder.indexOf(best.confidenceLevel) : -1;
    if (
      !best ||
      rank > bestRank ||
      (rank === bestRank && candidate.span.start < best.span.start)
    ) {
      best = candidate;
    }
  }
  return best;
}

export function analyzePost(
  input: PostInput,
  enabledPatternIds: readonly PatternId[] = supportedPatternIds,
): DetectionResult[] {
  const enabled = supportedPatternIds.filter((id) =>
    enabledPatternIds.includes(id),
  );
  if (!input.text.trim() || enabled.length === 0) return [];

  const context = extractContext(input);
  const results: DetectionResult[] = [];
  for (const id of enabled) {
    const candidate = strongest(detectors[id](context));
    if (!candidate) continue;

    results.push(
      detectionResultSchema.parse({
        ...candidate,
        patternId: id,
        patternName: patternNames[id],
        matchedText: input.text.slice(candidate.span.start, candidate.span.end),
      }),
    );
  }
  return results;
}
