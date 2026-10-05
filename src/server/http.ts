import "server-only";
import { getClientBySlug } from "@/services/clientService";
import type { ClientConfig } from "@/types/client";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

/**
 * Resolves the client for an API call or returns an error Response.
 * The tenant is always resolved server-side from the slug — a clientId sent by
 * the browser is only accepted if it matches the resolved tenant.
 */
export async function resolveClient(slug: unknown, claimedClientId?: unknown): Promise<ClientConfig | Response> {
  let client: ClientConfig | null = null;
  try {
    client = typeof slug === "string" ? await getClientBySlug(slug) : null;
  } catch {
    return json({ ok: false, error: "Service temporarily unavailable" }, 503);
  }
  if (!client) return json({ ok: false, error: "Unknown business" }, 404);
  if (claimedClientId !== undefined && claimedClientId !== null && claimedClientId !== client.id) {
    return json({ ok: false, error: "Client mismatch" }, 400);
  }
  return client;
}

export function str(v: unknown, max: number): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}
