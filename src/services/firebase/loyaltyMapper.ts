import type { LoyaltyAccount } from "@/types/loyalty";

/**
 * Canonical loyalty document (shared with Staff/Admin apps):
 *
 *   loyaltyAccounts/{customerId}
 *   loyaltyAccounts/{customerId}: the deployed Staff App currently writes
 *   { clientId, customerId, stamps, stampTarget, isEligibleForReward,
 *     totalRewardsRedeemed, lastStampAt, updatedAt }.
 *
 * The Customer App accepts the newer currentStamps/reward counters when present,
 * but reads `stamps` first while that remains the Staff writer's source of truth.
 * It never creates or updates loyalty records.
 */
const num = (value: unknown): number | undefined => {
  const parsed = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : undefined;
};
const nonNegativeCount = (value: unknown): number | undefined => {
  const parsed = num(value);
  return parsed !== undefined && parsed >= 0 ? Math.floor(parsed) : undefined;
};
const str = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value.trim() : undefined);

export function mapLoyaltyAccount(data: Record<string, unknown> | undefined, currentClientId: string, expectedCustomerId: string): LoyaltyAccount {
  if (!data) return { stamps: 0, currentStamps: 0, exists: false, belongsToClient: true };

  const docClientId = str(data.clientId);
  const docCustomerId = str(data.customerId);
  // Never show another business's stamps, or a document that claims another customer.
  const belongsToClient = (!docClientId || docClientId === currentClientId) && (!docCustomerId || docCustomerId === expectedCustomerId);
  if (!belongsToClient) return { stamps: 0, currentStamps: 0, exists: true, belongsToClient: false, clientId: docClientId };

  const currentStamps = Math.max(0, nonNegativeCount(data.stamps) ?? nonNegativeCount(data.currentStamps) ?? 0);
  const rewardAvailable = data.rewardAvailable === true || data.rewardUnlocked === true || data.isEligibleForReward === true;
  return {
    stamps: currentStamps,
    currentStamps,
    lifetimeStamps: nonNegativeCount(data.lifetimeStamps),
    rewardsEarned: nonNegativeCount(data.rewardsEarned),
    rewardsRedeemed: nonNegativeCount(data.rewardsRedeemed) ?? nonNegativeCount(data.totalRewardsRedeemed),
    lastStampAt: data.lastStampAt,
    exists: true,
    belongsToClient: true,
    clientId: docClientId,
    stampTarget: num(data.stampTarget),
    rewardName: str(data.rewardName),
    rewardDescription: str(data.rewardDescription),
    // Reward state is decided by Staff/Admin; accept the common field names.
    status: str(data.rewardStatus) ?? str(data.status) ?? (rewardAvailable ? "reward_available" : undefined),
  };
}
