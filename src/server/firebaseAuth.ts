import "server-only";
import { firebaseConfig } from "@/services/firebase/firebaseConfig";

/**
 * Verifies a Firebase ID token server-side via the Identity Toolkit lookup API
 * (no service-account needed). Returns the UID, or null if invalid/unverifiable.
 * Swap for firebase-admin `verifyIdToken` when a service account is configured.
 */
export async function verifyFirebaseIdToken(authHeader: string | null): Promise<string | null> {
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token || token.length > 4096) return null;
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token }),
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { users?: { localId?: string }[] };
    return data.users?.[0]?.localId ?? null;
  } catch {
    return null;
  }
}
