"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getAuth, type Auth } from "firebase/auth";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { getDatabase, type Database } from "firebase/database";
import { firebaseConfig, firebaseEnabled } from "./firebaseConfig";

/**
 * The ONE browser Firebase initialisation. `getApps()` guards against creating
 * duplicate apps (Fast Refresh, multiple imports). Services are created lazily.
 */
export function getFirebaseApp(): FirebaseApp | null {
  if (!firebaseEnabled || typeof window === "undefined") return null;
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export function getDb(): Firestore | null {
  const app = getFirebaseApp();
  return app ? getFirestore(app) : null;
}

export function getFirebaseAuth(): Auth | null {
  const app = getFirebaseApp();
  return app ? getAuth(app) : null;
}

/** Storage — customer app only READS admin-uploaded public assets. */
export function getFirebaseStorage(): FirebaseStorage | null {
  const app = getFirebaseApp();
  return app ? getStorage(app) : null;
}

/** Realtime Database — available for future real-time features (e.g. live queue). */
export function getRealtimeDb(): Database | null {
  const app = getFirebaseApp();
  return app ? getDatabase(app) : null;
}
