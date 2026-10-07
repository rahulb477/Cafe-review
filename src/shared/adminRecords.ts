import { formatFirestoreTimestamp } from "./firestoreTimestamp";
import { normalizeRating } from "./reviewAnalytics";
import { safeCountValue, type HistoryRow } from "./loyaltyDisplay";

const DASH = "—";

function dataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function cleanText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function pickText(data: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = cleanText(data[key]);
    if (value) return value;
  }
  return null;
}

export type FeedbackStatus = "New" | "Read" | "Resolved" | "—";

/** Normalizes old and current status spellings without fabricating identity/data. */
export function mapFeedbackStatus(value: unknown): FeedbackStatus {
  const status = cleanText(value)?.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (!status) return "New";
  if (["new", "pending", "unread", "submitted", "open"].includes(status)) return "New";
  if (["read", "reviewed", "in progress", "in review"].includes(status)) return "Read";
  if (["resolved", "closed", "done", "complete", "completed"].includes(status)) return "Resolved";
  return "—";
}

export interface FeedbackDisplay {
  id: string;
  message: string;
  rating: number | null;
  table: string;
  location: string;
  timestamp: string;
  status: FeedbackStatus;
}

/**
 * Anonymous feedback view model. It intentionally contains no customerId, UID,
 * name, phone, or email even if a malformed legacy document contains them.
 */
export function mapFeedbackForDisplay(id: string, raw: unknown): FeedbackDisplay {
  const data = dataRecord(raw);
  return {
    id,
    message: pickText(data, ["message", "feedback"]) ?? DASH,
    rating: normalizeRating(data.rating),
    table: pickText(data, ["table", "tableNumber"]) ?? DASH,
    location: pickText(data, ["location"]) ?? DASH,
    timestamp: formatFirestoreTimestamp(data.createdAt ?? data.timestamp, { withTime: true }),
    status: mapFeedbackStatus(data.status ?? data.state),
  };
}

export interface ActivityDisplay {
  id: string;
  activity: string;
  description: string;
  actor: string;
  customer: string;
  timestamp: string;
}

const ACTIVITY_LABELS: Record<string, string> = {
  stamp_added: "Stamp Added",
  stamp_added_counter: "Stamp Added",
  reward_redeemed: "Reward Redeemed",
  customer_created: "Customer Created",
  customer_updated: "Customer Updated",
  review_received: "Review Received",
  feedback_received: "Feedback Received",
};

function humanize(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** Maps a real activityLogs/{logId} row; UID fields are never used as display names. */
export function mapActivityForDisplay(id: string, raw: unknown): ActivityDisplay {
  const data = dataRecord(raw);
  const rawType = pickText(data, ["activityType", "type", "eventType", "action"]);
  const normalizedType = rawType?.toLowerCase().replace(/[\s-]+/g, "_") ?? "";
  const actor = pickText(data, ["actorName", "staffName", "adminName", "userName"]);
  const customerName = pickText(data, ["customerName", "customerCode"]);
  return {
    id,
    activity: rawType ? ACTIVITY_LABELS[normalizedType] ?? humanize(rawType) : DASH,
    description: pickText(data, ["description", "message", "details"]) ?? DASH,
    actor: actor ?? DASH,
    customer: customerName ?? DASH,
    timestamp: formatFirestoreTimestamp(data.createdAt ?? data.timestamp ?? data.updatedAt, { withTime: true }),
  };
}

function successfulRedemption(data: Record<string, unknown>): boolean {
  if (data.success === false || data.reversed === true || data.voided === true || data.cancelled === true) return false;
  const status = cleanText(data.status ?? data.state)?.toLowerCase();
  return !status || !/(fail|pending|cancel|reverse|void|reject|error)/.test(status);
}

function successfulStamp(data: Record<string, unknown>): boolean {
  if (data.success === false || data.succeeded === false || data.voided === true || data.reversed === true || data.deleted === true) return false;
  const status = cleanText(data.status ?? data.state ?? data.result)?.toLowerCase();
  return !status || !/(fail|pending|cancel|reverse|void|reject|error)/.test(status);
}

export interface RewardAnalytics {
  rewardsEarned: number;
  rewardsRedeemed: number;
}

/**
 * Aggregates only real loyalty counters and successful stamp/redemption rows.
 * Supports the deployed Staff field names (`stamps`, `totalRewardsRedeemed`,
 * `isEligibleForReward`) as well as the newer canonical counter names. Account,
 * redemption and threshold-crossing history are combined with max semantics to
 * avoid counting the same earned/redeemed reward twice.
 */
export function calculateRewardCountsByCustomer(
  loyaltyAccounts: Array<{ id: string; data: Record<string, unknown> }>,
  redemptions: HistoryRow[],
  clientId: string,
  stampTransactions: HistoryRow[] = []
): Map<string, RewardAnalytics> {
  const earnedCounters = new Map<string, number>();
  const redeemedCounters = new Map<string, number>();
  const currentlyEligible = new Set<string>();

  for (const row of loyaltyAccounts) {
    const data = row.data ?? {};
    if (data.status === "merged" || cleanText(data.mergedInto)) continue;
    const accountClientId = cleanText(data.clientId);
    if (accountClientId && accountClientId !== clientId) continue;
    const customerId = cleanText(data.customerId) ?? row.id;
    const earned = safeCountValue(data.rewardsEarned) ?? safeCountValue(data.earnedRewards) ?? safeCountValue(data.totalRewardsEarned) ?? 0;
    const redeemed = safeCountValue(data.rewardsRedeemed) ?? safeCountValue(data.totalRewardsRedeemed) ?? 0;
    earnedCounters.set(customerId, Math.max(earnedCounters.get(customerId) ?? 0, earned));
    redeemedCounters.set(customerId, Math.max(redeemedCounters.get(customerId) ?? 0, redeemed));
    if (data.isEligibleForReward === true || data.rewardAvailable === true || data.rewardUnlocked === true) {
      currentlyEligible.add(customerId);
    }
  }

  const redemptionsByCustomer = new Map<string, number>();
  const seenRedemptions = new Set<string>();
  for (const row of redemptions) {
    if (!row.id || seenRedemptions.has(row.id)) continue;
    seenRedemptions.add(row.id);
    const data = row.data ?? {};
    const customerId = cleanText(data.customerId);
    const recordClientId = cleanText(data.clientId);
    if (!customerId || (recordClientId && recordClientId !== clientId) || !successfulRedemption(data)) continue;
    redemptionsByCustomer.set(customerId, (redemptionsByCustomer.get(customerId) ?? 0) + 1);
  }

  // The deployed Staff schema has no cumulative rewardsEarned field. Count
  // unique successful stamps that cross the stored reward threshold; an
  // uncounted phase-one reservation is never treated as earned.
  const earnedFromStampHistory = new Map<string, number>();
  const seenStampTransactions = new Set<string>();
  for (const row of stampTransactions) {
    if (!row.id || seenStampTransactions.has(row.id)) continue;
    seenStampTransactions.add(row.id);
    const data = row.data ?? {};
    const customerId = cleanText(data.customerId);
    const recordClientId = cleanText(data.clientId);
    if (!customerId || (recordClientId && recordClientId !== clientId)) continue;
    if (cleanText(data.type)?.toUpperCase() !== "STAMP_ADDED") continue;
    if ("visitCounted" in data && data.visitCounted !== true) continue;
    if (!successfulStamp(data)) continue;
    const before = safeCountValue(data.stampCountBefore);
    const after = safeCountValue(data.stampCountAfter);
    const target = safeCountValue(data.stampTarget);
    if (before === null || after === null || target === null || target < 1) continue;
    if (before < target && after >= target) {
      earnedFromStampHistory.set(customerId, (earnedFromStampHistory.get(customerId) ?? 0) + 1);
    }
  }

  const customers = new Set([
    ...earnedCounters.keys(),
    ...redeemedCounters.keys(),
    ...redemptionsByCustomer.keys(),
    ...earnedFromStampHistory.keys(),
    ...currentlyEligible,
  ]);
  const result = new Map<string, RewardAnalytics>();
  for (const customerId of customers) {
    const redeemed = Math.max(redeemedCounters.get(customerId) ?? 0, redemptionsByCustomer.get(customerId) ?? 0);
    const earned = Math.max(
      earnedCounters.get(customerId) ?? 0,
      earnedFromStampHistory.get(customerId) ?? 0,
      redeemed + (currentlyEligible.has(customerId) ? 1 : 0)
    );
    result.set(customerId, { rewardsEarned: earned, rewardsRedeemed: redeemed });
  }
  return result;
}

export function calculateRewardAnalytics(
  loyaltyAccounts: Array<{ id: string; data: Record<string, unknown> }>,
  redemptions: HistoryRow[],
  clientId: string,
  stampTransactions: HistoryRow[] = []
): RewardAnalytics {
  let rewardsEarned = 0;
  let rewardsRedeemed = 0;
  for (const counts of calculateRewardCountsByCustomer(loyaltyAccounts, redemptions, clientId, stampTransactions).values()) {
    rewardsEarned += counts.rewardsEarned;
    rewardsRedeemed += counts.rewardsRedeemed;
  }
  return { rewardsEarned, rewardsRedeemed };
}
