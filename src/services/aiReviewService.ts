import type { ReviewGenerationInput, ReviewGenerationResult } from "@/types/review";
import { writeTemplateReview } from "@/lib/reviewTemplates";
import { getCustomerIdToken } from "./firebase/authService";

/**
 * Browser-facing AI review service. It NEVER talks to an AI vendor directly:
 * requests go to our server route (/api/ai/review), which picks the provider
 * (MockAIProvider or RealAIProvider) and tracks per-client monthly usage.
 * If the server is unreachable, a local template keeps the flow working.
 */
export async function generateReview(
  input: ReviewGenerationInput & { businessName: string; clientId: string; source: "firebase" | "local" },
  onProgress?: (stage: number) => void
): Promise<ReviewGenerationResult> {
  const stages = 4;
  const progress = (async () => {
    for (let i = 1; i < stages; i++) {
      await new Promise((r) => setTimeout(r, 650));
      onProgress?.(i);
    }
  })();

  let result: ReviewGenerationResult;
  try {
    // Firebase ID token lets the backend attribute usage to a verified customer.
    const idToken = input.source === "firebase" ? await getCustomerIdToken() : null;
    const res = await fetch("/api/ai/review", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
      body: JSON.stringify({ clientSlug: input.clientSlug, clientId: input.clientId, answers: input.answers }),
    });
    if (!res.ok) throw new Error("AI request failed");
    const data = (await res.json()) as ReviewGenerationResult;
    if (!data?.text) throw new Error("Empty review");
    result = data;
  } catch {
    result = { text: writeTemplateReview(input.answers, input.businessName), provider: "mock" };
  }
  await progress;
  onProgress?.(stages);
  return result;
}
