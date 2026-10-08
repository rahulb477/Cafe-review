import { json } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * Feedback writes are performed by the Customer App's authenticated Firestore
 * SDK flow so Firestore Rules can enforce create-only access. This legacy
 * endpoint previously acknowledged submissions without persisting them and is
 * intentionally disabled to prevent a false success response.
 */
export async function POST() {
  return json(
    { ok: false, error: "Feedback must be submitted through the authenticated Customer App Firestore flow." },
    410
  );
}
