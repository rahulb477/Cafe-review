import { firebaseConfig, firebaseEnabled, EXPECTED_FIREBASE_PROJECT_ID } from "./firebaseConfig";

/**
 * Runtime diagnostics for the Firebase session chain. Contains NO secrets:
 * the API key is reported only as length + last 4 chars, never in full.
 */
export type StepStatus = "pending" | "pass" | "fail" | "skipped";

export interface FirebaseDiagnostics {
  init: { status: StepStatus; projectId: string; apiKeyHint: string; code?: string };
  auth: { status: StepStatus; code?: string };
  uid: string | null;
  loyalty: { status: StepStatus; path: string | null; code?: string; exists?: boolean; stamps?: number };
  profile: { status: StepStatus; path: string | null; code?: string };
}

export function initialDiagnostics(): FirebaseDiagnostics {
  const key = firebaseConfig.apiKey ?? "";
  const projectId = firebaseConfig.projectId ?? "";
  const ok = firebaseEnabled && projectId === EXPECTED_FIREBASE_PROJECT_ID && key.length > 0;
  return {
    init: {
      status: ok ? "pass" : "fail",
      projectId,
      apiKeyHint: key ? `len ${key.length}, …${key.slice(-4)}` : "missing",
      code: ok ? undefined : !firebaseEnabled ? "firebase-disabled" : !key ? "missing-api-key" : "wrong-project",
    },
    auth: { status: "pending" },
    uid: null,
    loyalty: { status: "pending", path: null },
    profile: { status: "pending", path: null },
  };
}

/**
 * Normalises Firebase error codes, e.g.
 * "auth/api-key-not-valid.-please-pass-a-valid-api-key." → "auth/api-key-not-valid".
 */
export function errorCode(e: unknown): string {
  const raw = (e as { code?: string })?.code ?? (e instanceof Error ? e.message : String(e));
  return raw.replace(/[.\s].*$/, "") || "unknown";
}

/** Diagnostic mode: dev builds, NEXT_PUBLIC_DIAGNOSTICS=true, or ?diag=1 (sticky per tab). */
export function isDiagnosticMode(): boolean {
  if (process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_DIAGNOSTICS === "true") return true;
  if (typeof window === "undefined") return false;
  try {
    const q = new URLSearchParams(window.location.search).get("diag");
    if (q === "1") sessionStorage.setItem("qrapp:diag", "1");
    if (q === "0") sessionStorage.removeItem("qrapp:diag");
    return sessionStorage.getItem("qrapp:diag") === "1";
  } catch {
    return false;
  }
}
