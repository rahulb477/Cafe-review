import "server-only";
import { writeTemplateReview } from "@/lib/reviewTemplates";
import type { AIProvider, AIReviewRequest } from "./types";

/** Works with zero credentials — used in development/demo and as a fallback. */
export class MockAIProvider implements AIProvider {
  readonly name = "mock" as const;
  async generateReview({ client, answers }: AIReviewRequest): Promise<string> {
    return writeTemplateReview(answers, client.businessName);
  }
}
