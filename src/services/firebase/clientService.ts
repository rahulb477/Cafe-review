import "server-only";
import type { ClientConfig } from "@/types/client";
import { getDocument, listDocuments, queryWhere, type FsDoc } from "./firestoreRest";
import { PUBLISHED_STATUS } from "./firebaseConfig";
import { isPublicClientStatus, mapClient } from "./mappers";

/** Firestore client repository (server). Only published clients are returned. */

async function hydrate(doc: FsDoc): Promise<ClientConfig | null> {
  if (!isPublicClientStatus(doc.data.status)) return null;
  const tags = [`client:${doc.id}`];
  const [categories, items] = await Promise.all([
    listDocuments(`clients/${doc.id}/menuCategories`, tags),
    listDocuments(`clients/${doc.id}/menuItems`, tags),
  ]);
  // Defence in depth: ignore any subcollection doc that claims another client.
  const own = (d: FsDoc) => !d.data.clientId || d.data.clientId === doc.id || d.data.clientId === doc.data.id;
  return mapClient(doc.id, doc.data, categories.filter(own), items.filter(own));
}

export async function getClientBySlug(slug: string): Promise<ClientConfig | null> {
  // Rules: unauthenticated client queries must be constrained to status == "PUBLISHED".
  const docs = await queryWhere("clients", [["slug", slug], ["status", PUBLISHED_STATUS]], 3, [`slug:${slug}`]);
  const match = docs.find((d) => isPublicClientStatus(d.data.status));
  return match ? hydrate(match) : null;
}

export async function getClient(clientId: string): Promise<ClientConfig | null> {
  if (!/^[\w-]{1,128}$/.test(clientId)) return null;
  const doc = await getDocument(`clients/${clientId}`, [`client:${clientId}`]);
  return doc ? hydrate(doc) : null;
}

export async function listClients(): Promise<ClientConfig[]> {
  const docs = await queryWhere("clients", [["status", PUBLISHED_STATUS]], undefined, ["clients"]);
  const hydrated = await Promise.all(docs.map(hydrate));
  return hydrated.filter((c): c is ClientConfig => !!c);
}
