"use client";

import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import type { ReviewSubmission } from "@/types/review";
import { getDb } from "./firebaseClient";
import { ensureCustomer } from "./authService";

/** Review-generation activity → clients/{clientId}/reviews (create-only; customers can't edit). */
export async function addReviewRecord(
  clientId: string,
  answers: Pick<ReviewSubmission, "overallRating" | "staffRating" | "serviceRating" | "selectedItems" | "menuItemIds">,
  generatedReview: string,
  ctx: { provider: string; table: string | null; location: string | null }
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("firebase-disabled");
  const user = await ensureCustomer();
  await addDoc(collection(db, "clients", clientId, "reviews"), {
    clientId,
    customerId: user.uid,
    overallRating: answers.overallRating,
    staffRating: answers.staffRating,
    serviceRating: answers.serviceRating,
    // itemsTried: names of ONLY the menu items the customer selected.
    itemsTried: answers.selectedItems.slice(0, 20).map((n) => n.slice(0, 80)),
    menuItemIds: answers.menuItemIds.slice(0, 20).map((id) => id.slice(0, 128)),
    // Kept for backward compatibility with existing readers (same values as itemsTried).
    selectedItems: answers.selectedItems.slice(0, 20).map((n) => n.slice(0, 80)),
    generatedReview: generatedReview.slice(0, 4000),
    provider: ctx.provider,
    table: ctx.table,
    location: ctx.location,
    createdAt: serverTimestamp(),
  });
}
