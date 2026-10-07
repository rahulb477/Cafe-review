export interface LoyaltySettings {
  enabled: boolean;
  stampTarget: number;
  /** Short reward name, e.g. "Free Coffee". */
  rewardName: string;
  rewardDescription?: string;
  rewardImage?: string;
}

/** Read-only loyalty state for the signed-in customer (mutated only by Staff/Admin). */
export interface LoyaltyAccount {
  /** Legacy alias retained for existing customer-card components. */
  stamps: number;
  currentStamps: number;
  lifetimeStamps?: number;
  rewardsEarned?: number;
  rewardsRedeemed?: number;
  lastStampAt?: unknown;
  /** false = no loyaltyAccounts/{uid} document yet (0 stamps). */
  exists: boolean;
  /** false = the document belongs to another business/customer; shown as 0 here. */
  belongsToClient: boolean;
  clientId?: string;
  stampTarget?: number;
  rewardName?: string;
  rewardDescription?: string;
  status?: string;
}

export type LoyaltySyncStatus = "idle" | "connecting" | "live" | "unavailable" | "local";
