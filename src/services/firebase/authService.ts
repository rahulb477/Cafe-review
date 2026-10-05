"use client";

import { onAuthStateChanged, signInAnonymously, type User } from "firebase/auth";
import { getFirebaseAuth } from "./firebaseClient";
import { errorCode } from "./diagnostics";

/**
 * Customer identity = Firebase Anonymous Auth. No account creation; the UID is
 * persisted by Firebase (IndexedDB/localStorage) so loyalty stays stable on this
 * device. Upgrade to phone/email linking later without changing callers.
 */
let pending: Promise<User> | null = null;

export class AuthUnavailableError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

function waitForRestoredUser(): Promise<User | null> {
  const auth = getFirebaseAuth();
  if (!auth) return Promise.resolve(null);
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (u) => {
      unsub();
      resolve(u);
    });
  });
}

export function ensureCustomer(): Promise<User> {
  if (pending) return pending;
  pending = (async () => {
    const auth = getFirebaseAuth();
    if (!auth) throw new AuthUnavailableError("firebase-disabled");
    const restored = auth.currentUser ?? (await waitForRestoredUser());
    if (restored) return restored;
    try {
      return (await signInAnonymously(auth)).user;
    } catch (e) {
      const code = errorCode(e);
      console.warn("[diag] Anonymous Auth FAIL:", code);
      throw new AuthUnavailableError(code);
    }
  })();
  pending.catch(() => {
    pending = null; // allow retry
  });
  return pending;
}

/** ID token for our own backend (AI review). Never blocks for long. */
export async function getCustomerIdToken(timeoutMs = 2500): Promise<string | null> {
  try {
    const user = await Promise.race([ensureCustomer(), new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), timeoutMs))]);
    return await user.getIdToken();
  } catch {
    return null;
  }
}
