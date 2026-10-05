import type { LoyaltyAccount } from "@/types/loyalty";

/**
 * Canonical loyalty document (shared with Staff/Admin apps):
 *
 *   loyaltyAccounts/{customerId}        customerId = Firebase Auth UID
 *   { clientId, customerId, stamps, ...reward/loyalty fields owned by Staff/Admin }
 *
 * Pure mapping (no Firebase imports) so it can be unit-tested. The customer app
 * only READS these fields; it never writes this document.
 */
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export function mapLoyaltyAccount(data: Record<string, unknown> | undefined, currentClientId: string, expectedCustomerId: string): LoyaltyAccount {
  if (!data) return { stamps: 0, exists: false, belongsToClient: true };

  const docClientId = str(data.clientId);
  const docCustomerId = str(data.customerId);
  // Never show another business's stamps, or a document that claims another customer.
  const belongsToClient = (!docClientId || docClientId === currentClientId) && (!docCustomerId || docCustomerId === expectedCustomerId);
  if (!belongsToClient) return { stamps: 0, exists: true, belongsToClient: false, clientId: docClientId };

  const stamps = Math.max(0, Math.floor(num(data.stamps) ?? 0));
  const rewardAvailable = data.rewardAvailable === true || data.rewardUnlocked === true;
  return {
    stamps,
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
