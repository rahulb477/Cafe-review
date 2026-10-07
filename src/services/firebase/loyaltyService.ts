"use client";

import { collection, doc, onSnapshot, query, where, type DocumentData } from "firebase/firestore";
import type { LoyaltyAccount } from "@/types/loyalty";
import { summarizeStampHistory, type HistoryRow } from "@/shared/loyaltyDisplay";
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

export type CustomerStampHistory = ReturnType<typeof summarizeStampHistory>;

/**
 * Read-only real-time history fallback for deployments whose Staff writer still
 * stores `stamps` and has not backfilled lifetimeStamps. The query is limited by
 * both authenticated customer ID and the tenant path; Firestore Rules repeat
 * those ownership checks. Uncounted Staff reservations are excluded centrally.
 */
export function subscribeStampHistory(
  clientId: string,
  customerId: string,
  onData: (history: CustomerStampHistory) => void,
  onError: (e: Error) => void
): () => void {
  const db = getDb();
  if (!db) {
    onError(new Error("firebase-disabled"));
    return () => {};
  }
  const transactions = collection(db, "clients", clientId, "stampTransactions");
  const ownedHistory = query(
    transactions,
    where("customerId", "==", customerId),
    where("clientId", "==", clientId)
  );
  return onSnapshot(
    ownedHistory,
    (snapshot) => {
      const rows: HistoryRow[] = snapshot.docs.map((row) => ({ id: row.id, data: row.data() as DocumentData }));
      onData(summarizeStampHistory(rows, clientId, customerId));
    },
    onError
  );
}
