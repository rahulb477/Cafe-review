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
  stamps: number;
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
