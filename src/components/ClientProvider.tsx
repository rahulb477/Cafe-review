"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import type { ClientConfig } from "@/types/client";
import { createClientStore, type ClientSessionState, type ClientStore } from "@/store/clientStore";
import { themeToCssVars } from "@/lib/theme";
import { subscribeClient } from "@/services/firebase/liveClientService";
import { FirebaseSessionBridge } from "./FirebaseSessionBridge";

interface ClientCtx {
  client: ClientConfig;
  store: ClientStore;
}

const Ctx = createContext<ClientCtx | null>(null);

export function ClientProvider({ client: initial, children }: { client: ClientConfig; children: ReactNode }) {
  const [store] = useState(() => createClientStore(initial.id, initial.slug));
  // Server-rendered config first, then live Firestore updates for Firebase tenants.
  const [client, setClient] = useState<ClientConfig>(initial);

  useEffect(() => {
    store.getState().hydrate();
  }, [store]);

  useEffect(() => {
    if (initial.source !== "firebase") return;
    return subscribeClient(initial.id, initial.slug, setClient);
  }, [initial.id, initial.slug, initial.source]);

  return (
    <Ctx.Provider value={{ client, store }}>
      <div style={themeToCssVars(client.theme)} className="contents-theme">
        <FirebaseSessionBridge />
        {children}
      </div>
    </Ctx.Provider>
  );
}

function useCtx(): ClientCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useClient must be used inside <ClientProvider>");
  return ctx;
}

/** Current client configuration (resolved from the URL, kept live from Firestore). */
export function useClient(): ClientConfig {
  return useCtx().client;
}

/** Select from the current client's namespaced session store. */
export function useSession<T>(selector: (s: ClientSessionState) => T): T {
  return useStore(useCtx().store, selector);
}

/** Builds client-scoped hrefs: href("/menu") -> "/bake/menu". */
export function useClientHref() {
  const { slug } = useClient();
  return useCallback((path = "/") => (path === "/" || path === "" ? `/${slug}` : `/${slug}${path.startsWith("/") ? path : `/${path}`}`), [slug]);
}
