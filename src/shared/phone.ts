/**
 * THE canonical phone normalization (single source of truth) — used by the
 * Customer App, the display helpers and scripts/dedupe-customers.mjs.
 * Alias-free and erasable-syntax only, so Node can import it directly.
 *
 * "+917228984155", "917228984155", "07228984155", "+91 72289 84155",
 * "7228984155", "0091-72289-84155"  →  "+917228984155"
 */

export const PHONE_INDEX_COLLECTION = "customerPhoneIndex";

const CANONICAL_RE = /^\+91[6-9]\d{9}$/;

export function normalizeIndianPhone(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  let d = String(raw).trim().replace(/[\s\-().]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  if (!/^\d+$/.test(d)) return null;
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? `+91${d}` : null;
}

export function isCanonicalPhone(value: unknown): value is string {
  return typeof value === "string" && CANONICAL_RE.test(value);
}

/**
 * phoneIndexId — the deterministic, per-business phone index document id:
 *   `${clientId}_${normalizedPhone.replace(/\D/g, "")}`
 * e.g. ("cli_b1e8b437b2cb47", "+917568329747") → "cli_b1e8b437b2cb47_917568329747".
 *
 * The app stores this value on customers/{uid}.phoneIndexId and uses it as the
 * customerPhoneIndex/{phoneIndexId} document id. Firestore Rules verify it with
 * plain concatenation, NO regex replace:   clientId + '_' + normalizedPhone[1:]
 * (normalizedPhone is always "+91XXXXXXXXXX", so dropping the first char == digits).
 */
export function phoneIndexKey(clientId: string, normalizedPhone: string): string {
  if (!/^[\w-]{1,128}$/.test(clientId)) throw new Error("invalid clientId for phone index");
  if (!CANONICAL_RE.test(normalizedPhone)) throw new Error("phone must be normalized (+91XXXXXXXXXX)");
  return `${clientId}_${normalizedPhone.replace(/\D/g, "")}`;
}

/** Alias with the field name used on customers/{uid}. */
export const phoneIndexId = phoneIndexKey;

/** Grouping key for duplicate detection: same business + same normalized phone. */
export function customerIdentityKey(clientId: unknown, phone: unknown): string | null {
  const p = normalizeIndianPhone(phone);
  return typeof clientId === "string" && clientId && p ? `${clientId}|${p}` : null;
}
