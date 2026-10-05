import { getAppUrl } from "@/config/platform";

/**
 * QR service — builds the URLs encoded in printed/table QR codes and the
 * customer loyalty QR. Uses NEXT_PUBLIC_APP_URL (never a hardcoded domain).
 */
export function clientUrl(clientSlug: string, params?: Record<string, string>): string {
  const url = new URL(`${getAppUrl()}/${encodeURIComponent(clientSlug)}`);
  for (const [k, v] of Object.entries(params ?? {})) if (v) url.searchParams.set(k, v);
  return url.toString();
}

export function generateClientQR(clientSlug: string): string {
  return clientUrl(clientSlug);
}

export function generateTableQR(clientSlug: string, tableNumber: string | number): string {
  return clientUrl(clientSlug, { table: String(tableNumber) });
}

export function generateLocationQR(clientSlug: string, location: string): string {
  return clientUrl(clientSlug, { location });
}

/**
 * Customer loyalty QR — the Staff App scans it and resolves `ct` via
 * customerTokens/{token}. Contains only an opaque token, never personal data.
 */
export function generateCustomerQR(clientSlug: string, customerToken: string): string {
  return clientUrl(clientSlug, { ct: customerToken });
}

const TABLE_RE = /^[A-Za-z0-9-]{1,12}$/;
const LOCATION_RE = /^[a-z0-9-]{1,32}$/;

/** Validates QR params; invalid values are dropped rather than trusted. */
export function parseQrParams(params: URLSearchParams): { table: string | null; location: string | null; invalid: boolean } {
  const rawTable = params.get("table");
  const rawLocation = params.get("location");
  const table = rawTable && TABLE_RE.test(rawTable) ? rawTable : null;
  const location = rawLocation && LOCATION_RE.test(rawLocation.toLowerCase()) ? rawLocation.toLowerCase() : null;
  return { table, location, invalid: (!!rawTable && !table) || (!!rawLocation && !location) };
}
