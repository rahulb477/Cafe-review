import "server-only";
import { cache } from "react";
import type { ClientConfig } from "@/types/client";
import { clientSourceMode } from "./firebase/firebaseConfig";
import * as firebaseClients from "./firebase/clientService";
import { getLocalClient, getLocalClientBySlug, listLocalClients, normalizeSlug } from "./localClientRepository";

/**
 * ClientService (server facade) — the single entry point the app uses to
 * resolve tenants. Firestore is the source of truth; bundled demo clients are a
 * fallback in "hybrid" mode (missing tenant or Firestore unreachable).
 * Results are de-duplicated per request (React cache) and ISR-cached by fetch.
 */

export const getClientBySlug = cache(async (rawSlug: string | undefined | null): Promise<ClientConfig | null> => {
  const slug = normalizeSlug(rawSlug);
  if (!slug) return null;
  if (clientSourceMode === "local") return getLocalClientBySlug(slug);

  try {
    const remote = await firebaseClients.getClientBySlug(slug);
    if (remote) return remote;
  } catch (e) {
    console.warn(`[clientService] Firestore unavailable for "${slug}":`, e instanceof Error ? e.message : e);
    if (clientSourceMode === "firebase") throw e;
  }
  return clientSourceMode === "hybrid" ? getLocalClientBySlug(slug) : null;
});

export const getClient = cache(async (clientId: string): Promise<ClientConfig | null> => {
  if (clientSourceMode !== "local") {
    try {
      const remote = await firebaseClients.getClient(clientId);
      if (remote) return remote;
    } catch {
      if (clientSourceMode === "firebase") return null;
    }
  }
  return clientSourceMode === "firebase" ? null : getLocalClient(clientId);
});

/** All tenants (Firestore wins on slug conflicts). */
export async function listClients(): Promise<ClientConfig[]> {
  let remote: ClientConfig[] = [];
  if (clientSourceMode !== "local") {
    try {
      remote = await firebaseClients.listClients();
    } catch {
      remote = [];
    }
  }
  if (clientSourceMode === "firebase") return remote;
  const taken = new Set(remote.map((c) => c.slug));
  return [...remote, ...listLocalClients().filter((c) => !taken.has(c.slug))];
}

export async function listClientSlugs(): Promise<string[]> {
  return (await listClients()).map((c) => c.slug);
}
