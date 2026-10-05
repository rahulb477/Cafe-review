"use client";

import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import type { ClientConfig } from "@/types/client";
import { getDb } from "./firebaseClient";
import { ensureCustomer } from "./authService";

export type AnalyticsEventType =
  | "QR_OPENED"
  | "MENU_VIEWED"
  | "MENU_ITEM_VIEWED"
  | "GOOGLE_REVIEW_CLICKED"
  | "SOCIAL_CLICKED"
  | "WIFI_VIEWED"
  | "FEEDBACK_SUBMITTED"
  | "AI_REVIEW_GENERATED"
  | "LOYALTY_VIEWED";

export interface EventExtras {
  menuItemId?: string | null;
  tableId?: string | null;
  network?: string | null;
  /** Set false for events that must stay anonymous (e.g. feedback). */
  includeCustomer?: boolean;
}

/**
 * Lightweight, fire-and-forget event tracking → clients/{clientId}/events.
 * Minimal data only: clientId, eventType, server timestamp, and where relevant
 * the anonymous customer UID, menuItemId, tableId. Never throws.
 */
export function trackEvent(client: Pick<ClientConfig, "id" | "source">, eventType: AnalyticsEventType, extras: EventExtras = {}): void {
  if (client.source !== "firebase" || typeof window === "undefined") return;
  void (async () => {
    try {
      const db = getDb();
      if (!db) return;
      const user = await ensureCustomer();
      const data: Record<string, unknown> = { clientId: client.id, eventType, timestamp: serverTimestamp() };
      if (extras.includeCustomer !== false) data.customerId = user.uid;
      if (extras.menuItemId) data.menuItemId = String(extras.menuItemId).slice(0, 128);
      if (extras.tableId) data.tableId = String(extras.tableId).slice(0, 32);
      if (extras.network) data.network = String(extras.network).slice(0, 32);
      await addDoc(collection(db, "clients", client.id, "events"), data);
    } catch {
      // Analytics must never affect the customer experience.
    }
  })();
}
