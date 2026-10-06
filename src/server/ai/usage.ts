import "server-only";

/**
 * AI Review usage counters for the Firebase-only Customer App.
 *
 * There is intentionally NO database here (no PostgreSQL/Drizzle, no
 * DATABASE_URL). Counters live in process memory, per server instance, and are
 * purely advisory: they throttle real-AI spend so a single client cannot run up
 * an unbounded bill. They are never required for the app to build or to serve
 * customers — a cold start simply starts the month's counter from zero.
 *
 * Firestore is the app's backend; if durable usage reporting is ever needed it
 * belongs in Firestore (written by a trusted Staff/Admin app), not in a SQL
 * dependency of the customer-facing routes.
 */

export interface AiUsageRow {
  clientId: string;
  /** YYYY-MM (UTC) */
  month: string;
  requestCount: number;
  successfulRequests: number;
  failedRequests: number;
  updatedAt: string;
}

const globalForAiUsage = globalThis as typeof globalThis & {
  __cafeAiUsageStore?: Map<string, AiUsageRow>;
};

/** Survives Fast Refresh / repeated module evaluation within one instance. */
const store = (globalForAiUsage.__cafeAiUsageStore ??= new Map<string, AiUsageRow>());

function keyOf(clientId: string, month: string): string {
  return `${clientId}::${month}`;
}

export function currentMonth(d = new Date()): string {
  return d.toISOString().slice(0, 7);
}

export async function getUsage(clientId: string, month = currentMonth()): Promise<AiUsageRow | null> {
  return store.get(keyOf(clientId, month)) ?? null;
}

/** Records an outcome for the client's current month. */
export async function recordUsage(clientId: string, outcome: "request" | "success" | "failure"): Promise<void> {
  const month = currentMonth();
  const key = keyOf(clientId, month);
  const row =
    store.get(key) ?? {
      clientId,
      month,
      requestCount: 0,
      successfulRequests: 0,
      failedRequests: 0,
      updatedAt: new Date().toISOString(),
    };

  if (outcome === "request") row.requestCount += 1;
  else if (outcome === "success") row.successfulRequests += 1;
  else row.failedRequests += 1;
  row.updatedAt = new Date().toISOString();

  store.set(key, row);
}

/**
 * True if the client may make another real-AI request this month.
 * Without a database the limit is best-effort (per instance, reset on redeploy).
 */
export async function canUseRealAI(clientId: string, monthlyLimit: number): Promise<boolean> {
  try {
    const row = await getUsage(clientId);
    return (row?.requestCount ?? 0) < monthlyLimit;
  } catch {
    return false;
  }
}

/** Usage rows for the developer console (most recent months first). */
export function listUsage(limit = 200): AiUsageRow[] {
  return [...store.values()]
    .sort((a, b) => (a.month === b.month ? a.clientId.localeCompare(b.clientId) : b.month.localeCompare(a.month)))
    .slice(0, limit);
}
