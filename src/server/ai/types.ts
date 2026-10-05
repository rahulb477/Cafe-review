import "server-only";
import type { ClientConfig } from "@/types/client";
import type { ReviewAnswers } from "@/types/review";

export interface AIReviewRequest {
  client: ClientConfig;
  answers: ReviewAnswers;
}

/** Any AI backend implements this. Add Gemini/Anthropic/etc. as new providers. */
export interface AIProvider {
  readonly name: "mock" | "ai";
  generateReview(req: AIReviewRequest): Promise<string>;
}
