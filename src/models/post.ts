import type { TextSpan } from "./detection-result";

export interface PostContext {
  readonly source: "quoted_post" | "reply_target";
  readonly text: string;
}

export interface PostInput {
  readonly text: string;
  readonly context?: readonly PostContext[];
}

export interface AnalysisSentence {
  readonly span: TextSpan;
  readonly rulesText: string;
}

export interface DetectionContext {
  readonly sentences: readonly AnalysisSentence[];
  readonly language: "id" | "en" | "mixed" | "unknown";
  readonly relatedPosts: readonly PostContext[];
}
