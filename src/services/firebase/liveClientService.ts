"use client";

import { collection, doc, onSnapshot, type DocumentData } from "firebase/firestore";
import type { ClientConfig } from "@/types/client";
import { getDb } from "./firebaseClient";
import { isPublicClientStatus, mapClient, type RawItem } from "./mappers";

/**
 * Live tenant configuration: listens to clients/{clientId} + its menuCategories
 * and menuItems, so Admin changes (branding, menu, links, Wi-Fi, loyalty) appear
 * in the customer app instantly. Scoped strictly to one clientId.
 */
export function subscribeClient(clientId: string, slug: string, onChange: (client: ClientConfig) => void): () => void {
  const db = getDb();
  if (!db) return () => {};

  let base: DocumentData | null = null;
  let cats: RawItem[] | null = null;
  let items: RawItem[] | null = null;
  const own = (d: RawItem) => !d.data.clientId || d.data.clientId === clientId;

  const emit = () => {
    if (!base || !cats || !items || !isPublicClientStatus(base.status)) return;
    const next = mapClient(clientId, base, cats.filter(own), items.filter(own));
    if (next.slug === slug) onChange(next);
  };
  const warn = (e: Error) => console.warn("[liveClient] listener error:", e.message);

  const unsubs = [
    onSnapshot(doc(db, "clients", clientId), (s) => ((base = s.exists() ? s.data() : null), emit()), warn),
    onSnapshot(collection(db, "clients", clientId, "menuCategories"), (s) => ((cats = s.docs.map((d) => ({ id: d.id, data: d.data() }))), emit()), warn),
    onSnapshot(collection(db, "clients", clientId, "menuItems"), (s) => ((items = s.docs.map((d) => ({ id: d.id, data: d.data() }))), emit()), warn),
  ];
  return () => unsubs.forEach((u) => u());
}
