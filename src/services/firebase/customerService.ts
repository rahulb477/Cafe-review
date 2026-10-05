"use client";

import { doc, getDoc } from "firebase/firestore";
import type { CustomerProfile } from "@/types/customer";
import { getDb } from "./firebaseClient";
import { attachQrToken, saveCustomerProfile as writeProfile, type ProfileSaveResult } from "./customerProfileWrites";

export type { ProfileSaveResult };

/**
 * Customer repository — customers/{uid}, keyed by the Firebase Anonymous Auth
 * UID (one document per customer; no duplicates). Canonical fields:
 *   uid, clientId, name, phone, normalizedPhone, phoneIndexId, email, totalVisits, lastVisitAt,
 *   createdAt, updatedAt, status ("active"), qrToken
 *
 * The customer app writes ONLY profile fields (name/phone/email/updatedAt) and
 * the initial document. Visits (totalVisits/lastVisitAt) are written exclusively
 * by the Staff App after a successful stamp operation (src/shared/staffVisitService.ts).
 *
 * The QR contains only the random qrToken; the Staff App resolves it through
 * customerTokens/{token} → { customerId }.
 */
export interface StoredCustomer extends CustomerProfile {
  uid: string;
  clientId: string;
  qrToken: string | null;
}

const TOKEN_RE = /^[a-f0-9]{64}$/;

function db() {
  const d = getDb();
  if (!d) throw new Error("firebase-disabled");
  return d;
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Returns the customer's profile, or null if they haven't completed it yet. */
export async function getCustomer(uid: string): Promise<StoredCustomer | null> {
  const snap = await getDoc(doc(db(), "customers", uid));
  if (!snap.exists()) return null;
  const d = snap.data();
  if (typeof d.name !== "string" || typeof d.phone !== "string") return null;
  return {
    uid,
    name: d.name,
    phone: d.phone,
    clientId: typeof d.clientId === "string" ? d.clientId : "",
    qrToken: typeof d.qrToken === "string" && TOKEN_RE.test(d.qrToken) ? d.qrToken : null,
  };
}

/**
 * Creates or updates customers/{uid} with per-business phone uniqueness
 * (customerPhoneIndex, enforced atomically by a transaction + Security Rules).
 * `clientId` is the server-resolved tenant of the current /{businessSlug}.
 * Never resets totalVisits, lastVisitAt or createdAt.
 */
export function saveCustomerProfile(uid: string, clientId: string, profile: CustomerProfile): Promise<ProfileSaveResult> {
  return writeProfile(db(), uid, clientId, { name: profile.name, phone: profile.phone }, randomToken());
}

/** Ensures an existing profile has a QR token (older docs may lack one). */
export async function ensureCustomerToken(customer: StoredCustomer): Promise<string> {
  if (customer.qrToken) return customer.qrToken;
  const qrToken = randomToken();
  await attachQrToken(db(), customer.uid, customer.clientId, qrToken);
  return qrToken;
}
