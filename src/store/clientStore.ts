"use client";

import { createStore } from "zustand/vanilla";
import type { ReviewDraft } from "@/types/review";
import type { LoyaltySyncStatus } from "@/types/loyalty";
import type { CustomerProfile, ProfileStatus } from "@/types/customer";
import { initialDiagnostics, type FirebaseDiagnostics } from "@/services/firebase/diagnostics";

/**
 * Per-client session store. Every persisted value lives under a namespaced
 * key — qrapp:{clientSlug}:{name} — so two businesses opened in the same
 * browser never share review answers, table or customer data.
 *
 * Loyalty stamps are NOT stored or mutable here: they are read live from
 * Firestore (canonical loyaltyAccounts/{uid}) and only Staff/Admin can
 * change them. The fields below just mirror that read-only server state.
 */
export interface ClientSessionState {
  hydrated: boolean;
  clientId: string;
  clientSlug: string;
  tableNumber: string | null;
  location: string | null;
  customerId: string;
  review: ReviewDraft;
  generatedReview: string | null;
  /** Read-only mirror of current stamps from loyaltyAccounts/{uid}. */
  stamps: number;
  currentStamps: number | null;
  lifetimeStamps: number | null;
  rewardsEarned: number | null;
  rewardsRedeemed: number | null;
  lastStampAt: unknown | null;
  loyaltyAccountExists: boolean | null;
  stampHistoryCount: number | null;
  stampHistoryLatestAt: unknown | null;
  rewardStatus: string | null;
  loyaltyStatus: LoyaltySyncStatus;
  /** Firebase anonymous UID (Firebase tenants only). */
  authUid: string | null;
  /** Opaque QR token resolvable by the Staff App. */
  customerToken: string | null;
  /** Bumped to retry the Firebase session (auth/loyalty) after a failure. */
  syncAttempt: number;
  /** Customer name + mobile (Firebase: customers/{uid}; demo tenants: this device). */
  profile: CustomerProfile | null;
  profileStatus: ProfileStatus;
  /**
   * Menu items the customer hearted on the Menu screen. Device-local only
   * (namespaced like everything else) — never written to Firestore, so no
   * schema/rules change and no effect on loyalty or profiles.
   */
  favorites: string[];
  /** Runtime Firebase diagnostic chain (no secrets). */
  diag: FirebaseDiagnostics;

  hydrate: () => void;
  setIdentity: (uid: string) => void;
  setCustomerToken: (token: string | null) => void;
  setLoyalty: (l: {
    stamps?: number;
    currentStamps?: number | null;
    lifetimeStamps?: number | null;
    rewardsEarned?: number | null;
    rewardsRedeemed?: number | null;
    lastStampAt?: unknown | null;
    loyaltyAccountExists?: boolean | null;
    stampHistoryCount?: number | null;
    stampHistoryLatestAt?: unknown | null;
    rewardStatus?: string | null;
    status: LoyaltySyncStatus;
  }) => void;
  retrySync: () => void;
  setProfile: (profile: CustomerProfile | null, status: ProfileStatus) => void;
  /** Heart/un-heart a menu item (device-local favourites). */
  toggleFavorite: (menuItemId: string) => void;
  patchDiag: (patch: Partial<FirebaseDiagnostics>) => void;
  /** Demo (non-Firebase) tenants only: keep the profile on this device. */
  saveLocalProfile: (profile: CustomerProfile) => void;
  setQrContext: (ctx: { tableNumber?: string | null; location?: string | null }) => void;
  setOverallRating: (v: string) => void;
  setStaffRating: (v: string) => void;
  setServiceRating: (v: string) => void;
  toggleItem: (v: string) => void;
  resetReview: () => void;
  setGeneratedReview: (text: string | null) => void;
}

export type ClientStore = ReturnType<typeof createClientStore>;

export const emptyReview: ReviewDraft = {
  overallRating: null,
  staffRating: null,
  serviceRating: null,
  selectedItemIds: [],
};

export function storageKey(slug: string, name: string) {
  return `qrapp:${slug}:${name}`;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full / private mode — keep working in memory.
  }
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "c-" + Math.random().toString(36).slice(2, 12);
}

export function createClientStore(clientId: string, clientSlug: string) {
  const k = {
    review: storageKey(clientSlug, "reviewAnswers"),
    generated: storageKey(clientSlug, "generatedReview"),
    customer: storageKey(clientSlug, "customer"),
    session: storageKey(clientSlug, "session"),
    localProfile: storageKey(clientSlug, "profile"),
    favorites: storageKey(clientSlug, "favorites"),
  };

  const store = createStore<ClientSessionState>()((set, get) => ({
    hydrated: false,
    clientId,
    clientSlug,
    tableNumber: null,
    location: null,
    customerId: "",
    review: { ...emptyReview },
    generatedReview: null,
    stamps: 0,
    currentStamps: 0,
    lifetimeStamps: null,
    rewardsEarned: null,
    rewardsRedeemed: null,
    lastStampAt: null,
    loyaltyAccountExists: null,
    stampHistoryCount: null,
    stampHistoryLatestAt: null,
    rewardStatus: null,
    loyaltyStatus: "idle",
    authUid: null,
    customerToken: null,
    syncAttempt: 0,
    profile: null,
    profileStatus: "idle",
    favorites: [],
    diag: initialDiagnostics(),

    hydrate: () => {
      if (get().hydrated) return;
      const session = read<{ tableNumber: string | null; location: string | null }>(k.session, { tableNumber: null, location: null });
      const customer = read<{ customerId: string }>(k.customer, { customerId: "" });
      const stored = read<Partial<ReviewDraft>>(k.review, {});
      set({
        hydrated: true,
        tableNumber: get().tableNumber ?? session.tableNumber,
        location: get().location ?? session.location,
        customerId: get().authUid ?? (customer.customerId || makeId()),
        // Old drafts with free-text demo labels ("Coffee", "Others"…) are dropped.
        review: {
          overallRating: typeof stored.overallRating === "string" ? stored.overallRating : null,
          staffRating: typeof stored.staffRating === "string" ? stored.staffRating : null,
          serviceRating: typeof stored.serviceRating === "string" ? stored.serviceRating : null,
          selectedItemIds: Array.isArray(stored.selectedItemIds) ? stored.selectedItemIds.filter((x): x is string => typeof x === "string") : [],
        },
        generatedReview: read<string | null>(k.generated, null),
        favorites: read<string[]>(k.favorites, []).filter((x): x is string => typeof x === "string"),
      });
    },

    setQrContext: ({ tableNumber, location }) =>
      set((s) => ({
        tableNumber: tableNumber !== undefined ? tableNumber : s.tableNumber,
        location: location !== undefined ? location : s.location,
      })),
    setOverallRating: (v) => set((s) => ({ review: { ...s.review, overallRating: v } })),
    setStaffRating: (v) => set((s) => ({ review: { ...s.review, staffRating: v } })),
    setServiceRating: (v) => set((s) => ({ review: { ...s.review, serviceRating: v } })),
    toggleItem: (v) =>
      set((s) => {
        const has = s.review.selectedItemIds.includes(v);
        return {
          review: {
            ...s.review,
            selectedItemIds: has ? s.review.selectedItemIds.filter((i) => i !== v) : [...s.review.selectedItemIds, v],
          },
        };
      }),
    resetReview: () => set({ review: { ...emptyReview }, generatedReview: null }),
    setGeneratedReview: (text) => set({ generatedReview: text }),
    setIdentity: (uid) => set({ authUid: uid, customerId: uid }),
    setCustomerToken: (token) => set({ customerToken: token }),
    setLoyalty: ({ stamps, currentStamps, lifetimeStamps, rewardsEarned, rewardsRedeemed, lastStampAt, loyaltyAccountExists, stampHistoryCount, stampHistoryLatestAt, rewardStatus, status }) =>
      set((s) => ({
        stamps: stamps ?? s.stamps,
        currentStamps: currentStamps !== undefined ? currentStamps : stamps ?? s.currentStamps,
        lifetimeStamps: lifetimeStamps !== undefined ? lifetimeStamps : s.lifetimeStamps,
        rewardsEarned: rewardsEarned !== undefined ? rewardsEarned : s.rewardsEarned,
        rewardsRedeemed: rewardsRedeemed !== undefined ? rewardsRedeemed : s.rewardsRedeemed,
        lastStampAt: lastStampAt !== undefined ? lastStampAt : s.lastStampAt,
        loyaltyAccountExists: loyaltyAccountExists !== undefined ? loyaltyAccountExists : s.loyaltyAccountExists,
        stampHistoryCount: stampHistoryCount !== undefined ? stampHistoryCount : s.stampHistoryCount,
        stampHistoryLatestAt: stampHistoryLatestAt !== undefined ? stampHistoryLatestAt : s.stampHistoryLatestAt,
        rewardStatus: rewardStatus !== undefined ? rewardStatus : s.rewardStatus,
        loyaltyStatus: status,
      })),
    retrySync: () => set((s) => ({ syncAttempt: s.syncAttempt + 1, loyaltyStatus: "connecting", profileStatus: s.profile ? "ready" : "loading" })),
    setProfile: (profile, profileStatus) => set({ profile, profileStatus }),
    toggleFavorite: (menuItemId) =>
      set((s) => ({
        favorites: s.favorites.includes(menuItemId) ? s.favorites.filter((id) => id !== menuItemId) : [...s.favorites, menuItemId],
      })),
    patchDiag: (patch) => set((s) => ({ diag: { ...s.diag, ...patch } })),
    saveLocalProfile: (profile) => {
      write(k.localProfile, profile);
      set({ profile, profileStatus: "ready" });
    },
  }));

  // Persist each slice under its own namespaced key (only after hydration).
  store.subscribe((s, prev) => {
    if (!s.hydrated) return;
    if (s.review !== prev.review) write(k.review, s.review);
    if (s.generatedReview !== prev.generatedReview) write(k.generated, s.generatedReview);
    if (s.favorites !== prev.favorites) write(k.favorites, s.favorites);
    if (s.customerId !== prev.customerId && !s.authUid) write(k.customer, { customerId: s.customerId });
    if (s.tableNumber !== prev.tableNumber || s.location !== prev.location)
      write(k.session, { tableNumber: s.tableNumber, location: s.location });
  });

  return store;
}

/** Demo tenants: profile saved on this device by saveLocalProfile. */
export function readLocalProfile(slug: string): CustomerProfile | null {
  const p = read<CustomerProfile | null>(storageKey(slug, "profile"), null);
  return p && typeof p.name === "string" && typeof p.phone === "string" ? p : null;
}
