"use client";

import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getDb } from "./firebaseClient";
import { ensureCustomer } from "./authService";

export interface FirebaseFeedback {
  message: string;
  rating: number | null;
  table: string | null;
  location: string | null;
}

/**
 * Anonymous feedback → clients/{clientId}/feedback (canonical path).
 * The document contains NO customer identity (no uid, name or phone).
 * An anonymous Firebase session is required by the Security Rules (abuse
 * limiting) but is never written into the document.
 */
export async function addFeedback(clientId: string, f: FirebaseFeedback): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("firebase-disabled");
  await ensureCustomer();
  await addDoc(collection(db, "clients", clientId, "feedback"), {
    clientId,
    message: f.message.slice(0, 2000),
    rating: f.rating,
    table: f.table,
    location: f.location,
    createdAt: serverTimestamp(),
  });
}
