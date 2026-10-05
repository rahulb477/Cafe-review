"use client";

import { doc, onSnapshot } from "firebase/firestore";
import type { LoyaltyAccount } from "@/types/loyalty";
import { getDb } from "./firebaseClient";
import { mapLoyaltyAccount } from "./loyaltyMapper";

/** Canonical path — top-level, keyed by the Firebase Auth UID. Shared with Staff/Admin. */
export const LOYALTY_COLLECTION = "loyaltyAccounts";

/**
 * READ-ONLY real-time listener on loyaltyAccounts/{uid}.
 * The customer app never creates/updates/deletes this document: Staff/Admin
 * mutate it and onSnapshot reflects the change immediately (e.g. 3/8 → 4/8).
 */
export function subscribeLoyalty(
  clientId: string,
  customerId: string,
  onData: (account: LoyaltyAccount) => void,
  onError: (e: Error) => void
): () => void {
  const db = getDb();
  if (!db) {
    onError(new Error("firebase-disabled"));
    return () => {};
  }
  return onSnapshot(
    doc(db, LOYALTY_COLLECTION, customerId),
    (snap) => onData(mapLoyaltyAccount(snap.exists() ? snap.data() : undefined, clientId, customerId)),
    (e) => onError(e)
  );
}
