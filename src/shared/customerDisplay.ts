import { customerIdentityKey } from "./phone";
import { formatFirestoreTimestamp, parseFirestoreTimestamp, type FirestoreTimestampFormatOptions } from "./firestoreTimestamp";
import { formatCooldownRemaining, getStampCooldown, reconcileLifetimeStamps, safeCountValue, summarizeStampHistory, type HistoryRow } from "./loyaltyDisplay";

export { formatFirestoreDate, formatFirestoreTimestamp, parseFirestoreTimestamp, toDateSafe } from "./firestoreTimestamp";
export type FormatOptions = FirestoreTimestampFormatOptions;

/** Safe display fallbacks shared by Admin and Staff integrations. */
export const FALLBACK = {
  name: "—",
  phone: "—",
  email: "—",
  visits: "—",
  lastVisit: "—",
  date: "—",
} as const;

/** Non-negative integer or 0; useful for ranking and aggregation code. */
export function safeCount(value: unknown): number {
  return safeCountValue(value) ?? 0;
}

function text(value: unknown, fallback = "—"): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function optionalCount(value: unknown): number | null {
  return safeCountValue(value);
}

function firstText(data: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = typeof data[key] === "string" ? (data[key] as string).trim() : "";
    if (value) return value;
  }
  return null;
}

/** A visible customer identifier is a human-readable code, never a Firebase UID. */
export function formatCustomerCode(customer: Record<string, unknown> | null | undefined): string {
  if (!customer) return FALLBACK.phone;
  const value = firstText(customer, ["customerCode", "code", "customerNumber"]);
  if (!value) return FALLBACK.phone;
  return value.startsWith("#") ? value : `#${value}`;
}

export interface CustomerDisplay {
  /** Human-readable code for display; this is not the Firestore document id/UID. */
  customerId: string;
  customerCode: string;
  name: string;
  phone: string;
  email: string;
  totalVisits: string;
  totalVisitsNumber: number | null;
  lastVisit: string;
  joined: string;
  /** Backwards-compatible alias for currentStamps. */
  stamps: number | null;
  currentStamps: number | null;
  currentStampsDisplay: string;
  lifetimeStamps: number | null;
  stampTarget: number | null;
  stampProgress: string;
  rewardsEarned: number | null;
  rewardsRedeemed: number | null;
  lastStamp: string;
  nextStampAt: string;
  cooldownState: "unknown" | "active" | "elapsed";
  cooldownEligible: boolean | null;
  cooldownLabel: string;
  cooldownRemaining: string;
  rewardName: string | null;
  rewardStatus: string;
}

export interface CustomerDisplayOptions extends Pick<FormatOptions, "locale" | "timeZone"> {
  /** Tenant target, used only when the customer/account has no stored target. */
  stampTarget?: unknown;
  /** Injected clock and history make customer mapping deterministic and testable. */
  now?: Date | number;
  stampTransactions?: HistoryRow[];
}

/**
 * customers/{uid} + loyaltyAccounts/{customerId} → display-safe customer data.
 * `id` remains an internal join key and is deliberately never returned as the
 * customer-facing ID; customerCode/code/customerNumber is used instead.
 */
export function mapCustomerForDisplay(
  id: string,
  customer: Record<string, unknown> | null | undefined,
  loyalty?: Record<string, unknown> | null,
  opts: CustomerDisplayOptions = {}
): CustomerDisplay {
  const c = customer ?? {};
  const l = loyalty ?? {};
  const clientId = text(c.clientId, "");
  const customerId = text(c.uid ?? c.customerId, id);
  const history = opts.stampTransactions && clientId && customerId
    ? summarizeStampHistory(opts.stampTransactions, clientId, customerId)
    : null;

  const storedVisits = optionalCount(c.totalVisits);
  const visits = storedVisits === null && history
    ? history.countedVisits
    : storedVisits !== null && history
      ? Math.max(storedVisits, history.countedVisits)
      : storedVisits;
  // The live Staff App currently writes `stamps`. Prefer that field while it is
  // authoritative, then accept the newer alias for unmigrated writers.
  const currentStamps = optionalCount(l.stamps) ?? optionalCount(l.currentStamps);
  const rawTarget = optionalCount(l.stampTarget) ?? optionalCount(c.stampTarget) ?? optionalCount(opts.stampTarget);
  const target = rawTarget !== null && rawTarget > 0 ? rawTarget : null;
  const lifetimeStamps = reconcileLifetimeStamps(l, history);
  const customerCode = formatCustomerCode(c);
  const lastStampDate = parseFirestoreTimestamp(l.lastStampAt) ?? history?.latestStampAt ?? null;
  const lastVisitDate = parseFirestoreTimestamp(c.lastVisitAt) ?? history?.latestVisitAt ?? null;
  const cooldown = getStampCooldown(lastStampDate, opts.now);
  const displayOptions = { locale: opts.locale, timeZone: opts.timeZone };

  let rewardStatus = firstText(l, ["rewardStatus", "rewardState"]);
  if (!rewardStatus && (l.rewardAvailable === true || l.rewardUnlocked === true)) rewardStatus = "Reward available";
  if (rewardStatus) rewardStatus = rewardStatus.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

  return {
    // Historical integrations used this property as the visible ID. It now
    // carries the human-readable code and never falls back to a Firebase UID.
    customerId: customerCode,
    customerCode,
    name: text(c.name),
    phone: text(c.phone ?? c.normalizedPhone),
    email: text(c.email),
    totalVisits: visits === null ? FALLBACK.visits : String(visits),
    totalVisitsNumber: visits,
    lastVisit: formatFirestoreTimestamp(lastVisitDate, { ...displayOptions, withTime: true }),
    joined: formatFirestoreTimestamp(c.createdAt, displayOptions),
    stamps: currentStamps,
    currentStamps,
    currentStampsDisplay: currentStamps === null ? "—" : String(currentStamps),
    lifetimeStamps,
    stampTarget: target,
    stampProgress: currentStamps !== null && target !== null ? `${currentStamps}/${target}` : "—",
    rewardsEarned: optionalCount(l.rewardsEarned),
    rewardsRedeemed: optionalCount(l.rewardsRedeemed),
    lastStamp: formatFirestoreTimestamp(lastStampDate, { ...displayOptions, withTime: true }),
    nextStampAt: cooldown.nextStampAt ? formatFirestoreTimestamp(cooldown.nextStampAt, { ...displayOptions, withTime: true }) : "—",
    cooldownState: cooldown.state,
    cooldownEligible: cooldown.eligible,
    cooldownLabel: cooldown.label,
    cooldownRemaining: formatCooldownRemaining(cooldown.remainingMs),
    rewardName: firstText(l, ["rewardName"]),
    rewardStatus: rewardStatus ?? "—",
  };
}

// ── Duplicate-safe customer lists ───────────────────────────────────────────

export interface CustomerRow {
  id: string;
  data: Record<string, unknown> | null | undefined;
}

export interface DuplicateGroup {
  /** "{clientId}|{normalizedPhone}" */
  key: string;
  canonicalId: string;
  duplicateIds: string[];
}

function createdMillis(row: CustomerRow): number {
  return parseFirestoreTimestamp(row.data?.createdAt)?.getTime() ?? Number.POSITIVE_INFINITY;
}

/**
 * Shows each business + normalized phone once and reports potential duplicates.
 * A matching name alone is never treated as a duplicate; records need the same
 * business and a valid normalized phone. Merged records are excluded.
 */
export function dedupeCustomers<T extends CustomerRow>(rows: T[]): { unique: T[]; duplicateGroups: DuplicateGroup[] } {
  const live = rows.filter((row) => row.data?.status !== "merged");
  const groups = new Map<string, T[]>();
  const unique: T[] = [];

  for (const row of live) {
    const key = customerIdentityKey(row.data?.clientId, row.data?.normalizedPhone ?? row.data?.phone);
    if (!key) {
      unique.push(row);
      continue;
    }
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  const duplicateGroups: DuplicateGroup[] = [];
  for (const [key, list] of groups) {
    const sorted = [...list].sort(
      (a, b) => createdMillis(a) - createdMillis(b) || safeCount(b.data?.totalVisits) - safeCount(a.data?.totalVisits) || a.id.localeCompare(b.id)
    );
    unique.push(sorted[0]);
    if (sorted.length > 1) duplicateGroups.push({ key, canonicalId: sorted[0].id, duplicateIds: sorted.slice(1).map((row) => row.id) });
  }
  return { unique, duplicateGroups };
}
