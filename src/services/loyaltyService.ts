import type { LoyaltySettings } from "@/types/loyalty";

/**
 * Loyalty rules, parameterised by the client's LoyaltySettings. Stamp storage
 * lives in the client-namespaced session store (localStorage for V1); swap the
 * store's persistence for Firebase/Supabase later without touching these rules.
 */
export const loyaltyService = {
  capped(stamps: number, s: LoyaltySettings): number {
    return Math.min(stamps, s.stampTarget);
  },
  /** Reward is available when stamps reach the target or Staff marked it available. */
  hasReward(stamps: number, s: LoyaltySettings, rewardStatus?: string | null): boolean {
    const st = (rewardStatus ?? "").toLowerCase();
    return stamps >= s.stampTarget || ["reward_available", "reward_ready", "redeemable", "earned"].includes(st);
  },
  remaining(stamps: number, s: LoyaltySettings): number {
    return Math.max(s.stampTarget - stamps, 0);
  },
  progressLabel(stamps: number, s: LoyaltySettings): string {
    return `${Math.min(stamps, s.stampTarget)} / ${s.stampTarget} stamps towards a ${s.rewardName.toLowerCase()}`;
  },
};
