import { customerIdentityKey } from "./phone";

/**
 * Safe display mapping for customers/{uid} + loyaltyAccounts/{uid}.
 * Framework-agnostic and alias-free so the Admin Panel and Staff App can import
 * or copy it verbatim. Never returns "undefined", "Invalid Date" or "NaN".
 */

export const FALLBACK = {
  name: "Unnamed customer",
  phone: "—",
  email: "—",
  visits: "0",
  lastVisit: "No visits yet",
  date: "Date unavailable",
} as const;

/**
 * Converts any Firestore-ish date value to a valid Date, or null.
 * Supports: Firestore Timestamp (toDate), {seconds,nanoseconds} / {_seconds}
 * (serialized Timestamps), JS Date, ISO / REST timestampValue strings, and
 * numeric epochs (ms, or seconds when < 1e11).
 */
export function toDateSafe(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  let date: Date | null = null;

  if (value instanceof Date) date = value;
  else if (typeof value === "object") {
    const v = value as { toDate?: () => unknown; seconds?: unknown; _seconds?: unknown; nanoseconds?: unknown; _nanoseconds?: unknown };
    if (typeof v.toDate === "function") {
      const d = v.toDate();
      date = d instanceof Date ? d : null;
    } else {
      const s = typeof v.seconds === "number" ? v.seconds : typeof v._seconds === "number" ? v._seconds : null;
      const ns = typeof v.nanoseconds === "number" ? v.nanoseconds : typeof v._nanoseconds === "number" ? v._nanoseconds : 0;
      if (s !== null) date = new Date(s * 1000 + Math.floor(ns / 1e6));
    }
  } else if (typeof value === "number") {
    if (Number.isFinite(value) && value > 0) date = new Date(value < 1e11 ? value * 1000 : value);
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) return toDateSafe(Number(trimmed));
    date = new Date(trimmed);
  }

  return date && !Number.isNaN(date.getTime()) ? date : null;
}

export interface FormatOptions {
  fallback?: string;
  withTime?: boolean;
  locale?: string;
  timeZone?: string;
}

/** "12 Oct 2026" (or "12 Oct 2026, 4:05 pm" withTime), else the fallback. */
export function formatFirestoreDate(value: unknown, opts: FormatOptions = {}): string {
  const date = toDateSafe(value);
  if (!date) return opts.fallback ?? FALLBACK.date;
  return new Intl.DateTimeFormat(opts.locale ?? "en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(opts.withTime ? { hour: "numeric", minute: "2-digit" } : {}),
    ...(opts.timeZone ? { timeZone: opts.timeZone } : {}),
  }).format(date);
}

/** Non-negative integer or 0 (handles missing, strings, NaN, negatives). */
export function safeCount(value: unknown): number {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

const text = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v.trim() : fallback);

export interface CustomerDisplay {
  customerId: string;
  name: string;
  phone: string;
  email: string;
  totalVisits: string;
  totalVisitsNumber: number;
  lastVisit: string;
  joined: string;
  stamps: number;
  stampTarget: number | null;
  rewardName: string | null;
}

/**
 * customers/{uid} (+ optional loyaltyAccounts/{uid}) → display strings.
 * `id` is the Firestore document id, used when `uid` is missing on old docs.
 */
export function mapCustomerForDisplay(
  id: string,
  customer: Record<string, unknown> | null | undefined,
  loyalty?: Record<string, unknown> | null,
  opts: Pick<FormatOptions, "locale" | "timeZone"> = {}
): CustomerDisplay {
  const c = customer ?? {};
  const l = loyalty ?? {};
  const visits = safeCount(c.totalVisits);
  const target = safeCount(l.stampTarget);
  return {
    customerId: text(c.uid, id || FALLBACK.phone),
    name: text(c.name, FALLBACK.name),
    phone: text(c.phone, FALLBACK.phone),
    email: text(c.email, FALLBACK.email),
    totalVisits: String(visits),
    totalVisitsNumber: visits,
    lastVisit: formatFirestoreDate(c.lastVisitAt, { ...opts, withTime: true, fallback: FALLBACK.lastVisit }),
    joined: formatFirestoreDate(c.createdAt, { ...opts, fallback: FALLBACK.date }),
    stamps: safeCount(l.stamps),
    stampTarget: target > 0 ? target : null,
    rewardName: typeof l.rewardName === "string" && l.rewardName.trim() ? l.rewardName.trim() : null,
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
  return toDateSafe(row.data?.createdAt)?.getTime() ?? Number.POSITIVE_INFINITY;
}

/**
 * For Admin customer lists: shows each business + normalized phone ONCE and
 * reports leftover legacy duplicates instead of hiding them silently.
 * Customers soft-merged by scripts/dedupe-customers.mjs (status "merged") are excluded.
 * Canonical row: earliest valid createdAt, then most visits, then id.
 */
export function dedupeCustomers<T extends CustomerRow>(rows: T[]): { unique: T[]; duplicateGroups: DuplicateGroup[] } {
  const live = rows.filter((r) => r.data?.status !== "merged");
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
    if (sorted.length > 1) duplicateGroups.push({ key, canonicalId: sorted[0].id, duplicateIds: sorted.slice(1).map((r) => r.id) });
  }
  return { unique, duplicateGroups };
}
