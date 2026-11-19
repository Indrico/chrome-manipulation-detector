import type { DetectionCandidate } from "../models/detector.ts";
import type { TextSpan } from "../models/detection-result.ts";
import type { PatternId } from "../models/pattern.ts";
import type { DetectionContext } from "../models/post.ts";

export const modelPatterns = [
  "ad-hominem",
  "false-dilemma",
  "guilt-tripping",
] as const;
export type ModelPattern = (typeof modelPatterns)[number];
export const featureCount = 4096;
export const maxModelTextLength = 800;

export interface LinearClassifier {
  readonly weights: ArrayLike<number>;
  readonly scale: number;
  readonly bias: number;
  readonly threshold: number | null;
}

export interface LocalModel {
  readonly version: 1;
  readonly classifiers: Readonly<Record<ModelPattern, LinearClassifier>>;
}

export interface PackedLocalModel {
  readonly version: number;
  readonly classifiers: Readonly<
    Record<
      ModelPattern,
      Omit<LinearClassifier, "weights"> & { weights: string }
    >
  >;
}

export function unpackLocalModel(
  packed: PackedLocalModel,
): LocalModel | undefined {
  if (packed.version !== 1) return undefined;
  const classifiers = {} as Record<ModelPattern, LinearClassifier>;
  try {
    for (const id of modelPatterns) {
      const classifier = packed.classifiers[id];
      const weights = Int8Array.from(atob(classifier.weights), (byte) =>
        byte.charCodeAt(0),
      );
      if (
        weights.length !== featureCount ||
        !Number.isFinite(classifier.scale) ||
        classifier.scale <= 0 ||
        !Number.isFinite(classifier.bias) ||
        (classifier.threshold !== null &&
          !Number.isFinite(classifier.threshold))
      )
        return undefined;
      classifiers[id] = { ...classifier, weights };
    }
  } catch {
    return undefined;
  }
  return { version: 1, classifiers };
}

function featureIndex(feature: string) {
  let hash = 2166136261;
  for (let index = 0; index < feature.length; index++) {
    hash = Math.imul(hash ^ feature.charCodeAt(index), 16777619);
  }
  return hash & (featureCount - 1);
}

export function textFeatures(normalized: string) {
  const words = normalized.match(/[\p{L}\p{M}\p{N}]+/gu)?.slice(0, 112) ?? [];
  if (words.length < 4) return [];
  const features = new Set<number>();
  for (const [index, word] of words.entries()) {
    features.add(featureIndex(word));
    const previous = words[index - 1];
    const earlier = words[index - 2];
    if (previous !== undefined)
      features.add(featureIndex(`${previous} ${word}`));
    if (previous !== undefined && earlier !== undefined) {
      features.add(featureIndex(`${earlier} ${previous} ${word}`));
    }
    const padded = `^${word}$`;
    for (let offset = 0; offset + 3 <= padded.length; offset++) {
      features.add(featureIndex(`#${padded.slice(offset, offset + 3)}`));
    }
  }
  return [...features];
}

interface ModelWindow {
  readonly span: TextSpan;
  readonly features: readonly number[];
}

export function modelWindows(context: DetectionContext): ModelWindow[] {
  const windows: ModelWindow[] = [];
  const { sentences } = context;
  if ((sentences.at(-1)?.span.end ?? 0) > maxModelTextLength) return windows;
  for (let index = 0; index < Math.min(sentences.length, 10); index++) {
    const sentence = sentences[index]!;
    if (!sentence.rulesText) continue;
    const features = textFeatures(sentence.rulesText);
    if (features.length) windows.push({ span: sentence.span, features });
    const next = sentences[index + 1];
    if (next?.rulesText) {
      const combined = textFeatures(`${sentence.rulesText} ${next.rulesText}`);
      if (combined.length) {
        windows.push({
          span: { start: sentence.span.start, end: next.span.end },
          features: combined,
        });
      }
    }
  }
  return windows;
}

export function scoreFeatures(
  classifier: LinearClassifier,
  features: readonly number[],
) {
  let sum = 0;
  for (const index of features) sum += classifier.weights[index] ?? 0;
  return (
    classifier.bias + (sum * classifier.scale) / Math.sqrt(features.length)
  );
}

export function bestModelMatch(
  classifier: LinearClassifier,
  windows: readonly ModelWindow[],
) {
  let best: { span: TextSpan; score: number } | undefined;
  for (const { span, features } of windows) {
    const score = scoreFeatures(classifier, features);
    if (!best || score > best.score) best = { span, score };
  }
  return best;
}

const explanations: Readonly<Record<ModelPattern, string>> = {
  "ad-hominem":
    "Periksa apakah penilaian terhadap orangnya dipakai untuk mengabaikan isi pendapat.",
  "false-dilemma":
    "Periksa apakah teks mempersempit pilihan dan mengabaikan alternatif yang masuk akal.",
  "guilt-tripping":
    "Periksa apakah rasa malu, rasa wajib, atau utang budi dipakai untuk mendorong suatu keputusan.",
};

export function detectWithLocalModel(
  context: DetectionContext,
  enabled: readonly PatternId[],
  model: LocalModel,
) {
  const results = new Map<PatternId, DetectionCandidate>();
  const candidates = modelPatterns.filter(
    (id) => enabled.includes(id) && model.classifiers[id].threshold !== null,
  );
  if (!candidates.length) return results;
  const windows = modelWindows(context);
  for (const id of candidates) {
    const classifier = model.classifiers[id];
    const best = bestModelMatch(classifier, windows);
    if (
      best &&
      classifier.threshold !== null &&
      best.score >= classifier.threshold
    ) {
      results.set(id, {
        span: best.span,
        confidenceLevel: "possible",
        explanation: explanations[id],
        evidence: [
          "Susunan kata pada kutipan mirip dengan contoh berlabel dalam dataset pilot.",
        ],
        limitations: [
          "Saran berasal dari model lokal eksperimental. Periksa kutipan dan konteks unggahan.",
        ],
      });
    }
  }
  return results;
}
