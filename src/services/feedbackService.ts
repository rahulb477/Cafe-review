import type { ClientConfig } from "@/types/client";
import { addFeedback } from "./firebase/feedbackService";
import { firebaseEnabled } from "./firebase/firebaseConfig";

export interface FeedbackPayload {
  message: string;
  rating?: number | null;
  tableNumber?: string | null;
  location?: string | null;
}

const FRIENDLY_ERROR = "We couldn't send your feedback right now. Please check your connection and try again.";

function sanitize(p: FeedbackPayload) {
  const message = p.message.trim().slice(0, 2000);
  const rating = typeof p.rating === "number" && Number.isInteger(p.rating) && p.rating >= 1 && p.rating <= 5 ? p.rating : null;
  const short = (v?: string | null) => (v ? v.trim().slice(0, 32) || null : null);
  return { message, rating, table: short(p.tableNumber), location: short(p.location) };
}

/**
 * Anonymous feedback — Firestore is the source of truth (Firebase-only app).
 *  • Firebase tenants → Firestore ONLY (clients/{clientId}/feedback). There is no
 *    silent fallback; failures surface to the customer as a retryable error.
 *    clientId comes from the server-resolved tenant.
 *  • Bundled demo tenants (not in Firebase) → Firestore is attempted first (it
 *    works whenever the tenant exists and is published); otherwise the
 *    Firebase-only compatibility route acknowledges the submission.
 */
export async function submitFeedback(client: ClientConfig, payload: FeedbackPayload): Promise<{ ok: true }> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("You appear to be offline. Please reconnect and try again.");
  }
  const data = sanitize(payload);
  if (data.message.length < 3) throw new Error("Please tell us a little more (at least 3 characters).");

  if (client.source === "firebase" || firebaseEnabled) {
    try {
      await addFeedback(client.id, data);
      return { ok: true };
    } catch (e) {
      console.warn("[feedback] Firestore write failed:", (e as { code?: string })?.code ?? (e instanceof Error ? e.message : e));
      if (client.source === "firebase") throw new Error(FRIENDLY_ERROR);
    }
  }

  const res = await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientSlug: client.slug, clientId: client.id, message: data.message, rating: data.rating, tableNumber: data.table, location: data.location }),
  }).catch(() => null);
  if (!res?.ok) throw new Error(FRIENDLY_ERROR);
  return { ok: true };
}
