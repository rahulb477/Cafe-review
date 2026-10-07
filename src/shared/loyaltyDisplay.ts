import { formatFirestoreTimestamp, parseFirestoreTimestamp } from "./firestoreTimestamp";

export const STAMP_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const DASH = "—";

export interface HistoryRow {
  id: string;
  data: Record<string, unknown>;
}

export function safeCountValue(value: unknown): number | null {
  if (typeof value === "string" && value.trim() === "") return null;
  const numeric = typeof value === "string" ? Number(value) : value;
  if (typeof numeric !== "number" || !Number.isFinite(numeric) || numeric < 0) return null;
  return Math.floor(numeric);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function positiveStampAmount(data: Record<string, unknown>): number | null {
  for (const key of ["stampsAwarded", "stampAmount", "amount", "stampDelta", "delta"]) {
    if (!(key in data)) continue;
    const value = data[key];
    if (typeof value === "string" && value.trim() === "") return null;
    const amount = typeof value === "string" ? Number(value) : value;
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return null;
    return Math.floor(amount) || null;
  }
  // Each document in stampTransactions is a successful committed operation;
  // legacy records without an amount represent one awarded stamp.
  return 1;
}

function isFailedOrReversed(data: Record<string, unknown>): boolean {
  if (data.success === false || data.succeeded === false || data.isSuccessful === false) return true;
  if (data.voided === true || data.reversed === true || data.isReversed === true || data.deleted === true) return true;
  const state = [data.status, data.state, data.result]
    .map((value) => text(value)?.toLowerCase())
    .filter((value): value is string => !!value)
    .join(" ");
  if (/failed|failure|cancelled|canceled|reversed|voided|rejected|pending|error/.test(state)) return true;
  const type = [data.type, data.transactionType, data.action]
    .map((value) => text(value)?.toLowerCase())
    .filter((value): value is string => !!value)
    .join(" ");
  return /redeem|redemption|remove|deduct|debit|refund|reversal|void|cancel/.test(type);
}

/**
 * Counts distinct, successful stamp-award history records for a customer.
 * Ownership is checked against each record; a matching name is never used.
 */
export function summarizeStampHistory(
  rows: HistoryRow[],
  clientId: string,
  customerId: string
): { awardedStamps: number; transactionCount: number; countedVisits: number; latestStampAt: Date | null; latestVisitAt: Date | null } {
  const seen = new Set<string>();
  let awardedStamps = 0;
  let transactionCount = 0;
  let countedVisits = 0;
  let latestStampAt: Date | null = null;
  let latestVisitAt: Date | null = null;

  for (const row of rows) {
    if (!row.id || seen.has(row.id)) continue;
    seen.add(row.id);
    const data = row.data ?? {};
    if (text(data.customerId) !== customerId) continue;
    const recordClientId = text(data.clientId);
    if (recordClientId && recordClientId !== clientId) continue;
    // The Staff App first reserves an uncounted ledger row, then marks it true
    // in the same commit as the visit and loyalty update. Never treat a
    // reservation or a malformed flag as a successful historical stamp.
    if ("visitCounted" in data && data.visitCounted !== true) continue;
    if (isFailedOrReversed(data)) continue;

    const amount = positiveStampAmount(data);
    if (amount === null) continue;
    awardedStamps += amount;
    transactionCount += 1;
    if (data.visitCounted === true) {
      countedVisits += 1;
      const visitAt = parseFirestoreTimestamp(data.visitCountedAt ?? data.createdAt ?? data.timestamp ?? data.transactionAt);
      if (visitAt && (!latestVisitAt || visitAt.getTime() > latestVisitAt.getTime())) latestVisitAt = visitAt;
    }

    const at = parseFirestoreTimestamp(data.createdAt ?? data.timestamp ?? data.transactionAt);
    if (at && (!latestStampAt || at.getTime() > latestStampAt.getTime())) latestStampAt = at;
  }

  return { awardedStamps, transactionCount, countedVisits, latestStampAt, latestVisitAt };
}

/** Lifetime can only be reconciled upwards; existing real values are never reduced. */
export function reconcileLifetimeStamps(
  loyalty: Record<string, unknown> | null | undefined,
  history: Pick<ReturnType<typeof summarizeStampHistory>, "awardedStamps"> | null = null
): number | null {
  const data = loyalty ?? {};
  // The Staff App's deployed schema uses `stamps`; prefer it until all writers
  // dual-write the canonical `currentStamps` field.
  const current = safeCountValue(data.stamps) ?? safeCountValue(data.currentStamps);
  const existingLifetime = safeCountValue(data.lifetimeStamps);
  const historyLifetime = history ? safeCountValue(history.awardedStamps) : null;
  const values = [current, existingLifetime, historyLifetime].filter((value): value is number => value !== null);
  return values.length ? Math.max(...values) : null;
}

export type CooldownState = "unknown" | "active" | "elapsed";

/** Safe compact countdown; ceiling seconds avoids displaying eligible early. */
export function formatCooldownRemaining(remainingMs: number | null): string {
  if (typeof remainingMs !== "number" || !Number.isFinite(remainingMs) || remainingMs < 0) return DASH;
  if (remainingMs === 0) return "Eligible now";
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

export interface StampCooldown {
  state: CooldownState;
  eligible: boolean | null;
  nextStampAt: Date | null;
  remainingMs: number | null;
  label: string;
}

/**
 * 12-hour cooldown visibility only. An absent/malformed lastStampAt is unknown,
 * never an assertion that an admin-side stamp is immediately eligible.
 */
export function getStampCooldown(lastStampAt: unknown, now: Date | number = new Date()): StampCooldown {
  const last = parseFirestoreTimestamp(lastStampAt);
  const nowDate = parseFirestoreTimestamp(now);
  if (!last || !nowDate) return { state: "unknown", eligible: null, nextStampAt: null, remainingMs: null, label: DASH };

  const nextStampAt = new Date(last.getTime() + STAMP_COOLDOWN_MS);
  if (!Number.isFinite(nextStampAt.getTime())) return { state: "unknown", eligible: null, nextStampAt: null, remainingMs: null, label: DASH };
  const remainingMs = Math.max(0, nextStampAt.getTime() - nowDate.getTime());
  const active = remainingMs > 0;
  return {
    state: active ? "active" : "elapsed",
    eligible: !active,
    nextStampAt,
    remainingMs,
    label: active ? "Cooldown active" : "Cooldown complete",
  };
}

function firstText(data: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = text(data[key]);
    if (value) return value;
  }
  return null;
}

function customerCode(data: Record<string, unknown>): string | null {
  const value = firstText(data, ["customerCode", "code", "customerNumber"]);
  if (!value) return null;
  return value.startsWith("#") ? value : `#${value}`;
}

function formatAmount(data: Record<string, unknown>): string {
  for (const key of ["stampsAwarded", "stampAmount", "amount", "stampDelta", "delta"]) {
    if (!(key in data)) continue;
    const value = data[key];
    const amount = typeof value === "string" ? Number(value) : value;
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount === 0) return DASH;
    const formatted = Number.isInteger(amount) ? String(Math.abs(amount)) : String(Math.abs(amount));
    return amount > 0 ? `+${formatted}` : `−${formatted}`;
  }
  return "+1";
}

function transactionType(data: Record<string, unknown>): string {
  const type = firstText(data, ["transactionType", "type", "action"])?.toLowerCase() ?? "";
  const source = firstText(data, ["source", "channel", "location"])?.toLowerCase() ?? "";
  if (/visit|counter/.test(type) || (/stamp/.test(type) && /counter/.test(source))) return "Visit stamp (counter)";
  if (/stamp|award|add/.test(type) || !type) return "Stamp added";
  return type
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function staffName(data: Record<string, unknown>): string | null {
  const nested = data.staff && typeof data.staff === "object" ? (data.staff as Record<string, unknown>) : {};
  return firstText(data, ["staffName", "staffDisplayName", "createdByName"]) ?? firstText(nested, ["name", "displayName"]);
}

function staffRole(data: Record<string, unknown>): string {
  const nested = data.staff && typeof data.staff === "object" ? (data.staff as Record<string, unknown>) : {};
  return (firstText(data, ["staffRole", "role"]) ?? firstText(nested, ["role"]) ?? "STAFF").toUpperCase();
}

export interface StampTransactionDisplay {
  transactionId: string;
  type: string;
  customer: string;
  staff: string;
  timestamp: string;
  amount: string;
}

/** Maps a canonical clients/{clientId}/stampTransactions record for display. */
export function mapStampTransactionForDisplay(
  id: string,
  data: Record<string, unknown>,
  customer?: Record<string, unknown> | null
): StampTransactionDisplay {
  const customerName = text(customer?.name);
  const code = customer ? customerCode(customer) : null;
  const customerLabel = [customerName, code].filter(Boolean).join(" · ") || DASH;
  const name = staffName(data);
  return {
    transactionId: text(data.transactionId) ?? (id || DASH),
    type: transactionType(data),
    customer: customerLabel,
    staff: name ? `${name} · ${staffRole(data)}` : DASH,
    timestamp: formatFirestoreTimestamp(data.createdAt ?? data.timestamp ?? data.transactionAt, { withTime: true }),
    amount: formatAmount(data),
  };
}
