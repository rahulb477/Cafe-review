import type { FirebaseOptions } from "firebase/app";

/**
 * Single source of Firebase configuration (shared by browser SDK + server REST).
 * Values may be overridden per deployment with NEXT_PUBLIC_FIREBASE_* env vars.
 * Firebase web config values are public identifiers, not secrets — access is
 * enforced by Security Rules (see firestore.rules / storage.rules).
 */
export const EXPECTED_FIREBASE_PROJECT_ID = "cafe-review7";

export const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyAxQ3t3r5zxjKR-6D7xO82dIyR9_3EWBNQg",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "cafe-review7.firebaseapp.com",
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "https://cafe-review7-default-rtdb.firebaseio.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || EXPECTED_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "cafe-review7.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "186233902821",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:186233902821:web:4192c5da4967503512660c",
};

/**
 * Guard against accidentally pointing this app at a different Firebase project.
 * If the configured project doesn't match, Firebase is disabled and the app runs
 * on the local demo data source instead.
 */
export const firebaseEnabled: boolean = (() => {
  if (process.env.NEXT_PUBLIC_DISABLE_FIREBASE === "true") return false;
  if (firebaseConfig.projectId !== EXPECTED_FIREBASE_PROJECT_ID) {
    console.error(`[firebase] Refusing to connect to project "${firebaseConfig.projectId}" (expected "${EXPECTED_FIREBASE_PROJECT_ID}").`);
    return false;
  }
  return true;
})();

/**
 * Client data source:
 *  - "hybrid"   (default) Firestore first, bundled demo clients as fallback
 *  - "firebase" Firestore only (recommended once all tenants live in Firebase)
 *  - "local"    bundled demo clients only
 */
export type ClientSourceMode = "hybrid" | "firebase" | "local";
export const clientSourceMode: ClientSourceMode = (() => {
  const v = (process.env.NEXT_PUBLIC_CLIENT_SOURCE || "hybrid").toLowerCase();
  const mode = v === "firebase" || v === "local" ? v : "hybrid";
  return !firebaseEnabled && mode !== "local" ? "local" : mode;
})();

/** Seconds a server-rendered client config is cached before re-fetching (live listeners update instantly). */
export const CLIENT_REVALIDATE_SECONDS = 60;

/**
 * Status value the server filters on when resolving tenants. Firestore Rules only
 * allow unauthenticated client queries constrained to status == "PUBLISHED".
 */
export const PUBLISHED_STATUS = "PUBLISHED";

/** Client statuses that are visible to customers. */
export const PUBLIC_CLIENT_STATUSES = ["published", "active", "live"];
