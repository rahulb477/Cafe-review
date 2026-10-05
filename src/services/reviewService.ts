import type { ClientConfig } from "@/types/client";
import type { ReviewSubmission } from "@/types/review";
import { addReviewRecord } from "./firebase/reviewService";

/**
 * Persists review-generation activity for the current client. Firestore for
 * Firebase tenants (create-only), server API fallback otherwise. Never blocks
 * or breaks the customer flow.
 */
export async function saveReview(client: ClientConfig, submission: ReviewSubmission, generatedText: string, customerId: string, provider: string): Promise<void> {
  if (client.source === "firebase") {
    try {
      await addReviewRecord(client.id, submission, generatedText, { provider, table: submission.tableNumber, location: submission.location });
      return;
    } catch (e) {
      console.warn("[reviews] Firestore write failed, using API fallback:", e instanceof Error ? e.message : e);
    }
  }
  try {
    await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientSlug: client.slug, clientId: client.id, submission, generatedText, customerId }),
    });
  } catch {
    // Offline — the customer flow continues regardless.
  }
}
