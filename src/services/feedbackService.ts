import type { ClientConfig } from "@/types/client";
import {
  addFeedback,
  clearPendingFeedback,
  FEEDBACK_CONFIRMED_EVENT,
  getPendingFeedback,
  type FirebaseFeedback,
} from "./firebase/feedbackService";

export type FeedbackPayload = FirebaseFeedback;

/**
 * Customer feedback is written to its canonical Firestore collection only.
 * Never acknowledge a submission from a fallback endpoint that does not persist
 * the feedback document.
 */
export async function submitFeedback(client: ClientConfig, payload: FeedbackPayload): Promise<{ ok: true }> {
  await addFeedback(client.id, payload);
  return { ok: true };
}

export { clearPendingFeedback, FEEDBACK_CONFIRMED_EVENT, getPendingFeedback };
