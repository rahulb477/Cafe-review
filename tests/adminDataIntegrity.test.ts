import assert from "node:assert/strict";
import test from "node:test";
import { Timestamp } from "firebase/firestore";
import type { DocumentSnapshot, Transaction } from "firebase/firestore";
import { mapActivityForDisplay, mapFeedbackForDisplay, mapFeedbackStatus, calculateRewardAnalytics } from "../src/shared/adminRecords";
import { mapCustomerForDisplay } from "../src/shared/customerDisplay";
import { formatFirestoreTimestamp, parseFirestoreTimestamp } from "../src/shared/firestoreTimestamp";
import { formatCooldownRemaining, getStampCooldown, mapStampTransactionForDisplay, reconcileLifetimeStamps, summarizeStampHistory, STAMP_COOLDOWN_MS } from "../src/shared/loyaltyDisplay";
import { calculateReviewAnalytics, formatAverageRating, normalizeRating, normalizeReviewRecord } from "../src/shared/reviewAnalytics";
import { commitVisit, type PreparedVisit } from "../src/shared/staffVisitService";
import { mapLoyaltyAccount } from "../src/services/firebase/loyaltyMapper";
import { buildAdminPanelViewModel } from "../src/services/firebase/adminDataService";

const date = new Date(Date.UTC(2026, 9, 7, 9, 42, 0));
const serialized = { seconds: Math.floor(date.getTime() / 1000), nanoseconds: 0 };
const withTime = { withTime: true, timeZone: "UTC" } as const;

test("central timestamp formatter accepts Firestore Timestamp, Date, ISO, and serialized values", () => {
  const expected = "Oct 7, 2026, 09:42 AM";
  assert.equal(formatFirestoreTimestamp(Timestamp.fromDate(date), withTime), expected);
  assert.equal(formatFirestoreTimestamp(date, withTime), expected);
  assert.equal(formatFirestoreTimestamp(date.toISOString(), withTime), expected);
  assert.equal(formatFirestoreTimestamp(serialized, withTime), expected);
  assert.equal(parseFirestoreTimestamp(serialized)?.getTime(), date.getTime());
});

test("central timestamp formatter returns an em dash for missing and malformed timestamps", () => {
  for (const value of [null, undefined, "", "not a date", new Date(Number.NaN), Number.NaN, Infinity, {}, { seconds: "bad" }, { seconds: 1, nanoseconds: 1_000_000_000 }]) {
    assert.equal(formatFirestoreTimestamp(value, withTime), "—");
    assert.equal(parseFirestoreTimestamp(value), null);
  }
  assert.equal(formatFirestoreTimestamp({ toDate: () => { throw new Error("bad timestamp"); } }, withTime), "—");
});

test("review schema normalizes ratings and averages 5/5/5 as one five-star review", () => {
  const review = normalizeReviewRecord("r1", {
    clientId: "client_bake",
    customerId: "customer-uid",
    foodRating: "5",
    serviceRating: 5,
    atmosphereRating: "Amazing",
    selectedItems: ["Cappuccino"],
    source: "qr",
    status: "PUBLISHED",
    createdAt: serialized,
  });
  assert.deepEqual([review.foodRating, review.serviceRating, review.atmosphereRating], [5, 5, 5]);
  const analytics = calculateReviewAnalytics([{ id: "r1", data: review }]);
  assert.equal(analytics.totalReviews, 1);
  assert.equal(analytics.ratedReviews, 1);
  assert.equal(analytics.averageDisplay, "5.0");
  assert.deepEqual(analytics.distribution, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 });
});

test("review analytics excludes missing/invalid ratings and formats averages without NaN", () => {
  const noReviews = calculateReviewAnalytics([]);
  assert.equal(noReviews.totalReviews, 0);
  assert.equal(noReviews.averageRating, null);
  assert.equal(noReviews.averageDisplay, "—");

  const reviews = calculateReviewAnalytics([
    { id: "a", data: { overallRating: 5 } },
    { id: "b", data: { overallRating: "4" } },
    { id: "c", data: { overallRating: undefined, foodRating: "not-a-rating", serviceRating: Number.NaN } },
  ]);
  assert.equal(reviews.totalReviews, 3);
  assert.equal(reviews.ratedReviews, 2);
  assert.equal(reviews.averageDisplay, "4.5");
  assert.deepEqual(reviews.distribution, { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 });
  assert.equal(formatAverageRating((5 + 4 + 5) / 3), "4.67");
  assert.equal(normalizeRating(Number.NaN), null);
  assert.equal(normalizeRating("Infinity"), null);
  assert.equal(normalizeRating("6"), null);
  assert.equal(formatAverageRating(Number.NaN), "—");
});

test("customer display uses human code, canonical stamp fields, real visits, and safe dates", () => {
  const stampTransactions = [
    { id: "tx1", data: { clientId: "client_bake", customerId: "uid-123", amount: 1, visitCounted: true, createdAt: serialized } },
    { id: "tx2", data: { clientId: "client_bake", customerId: "uid-123", amount: 1, visitCounted: true, createdAt: { seconds: serialized.seconds + 1, nanoseconds: 0 } } },
  ];
  const display = mapCustomerForDisplay(
    "uid-123",
    { uid: "uid-123", customerCode: "4EIUHB", name: "Kai", totalVisits: "2", lastVisitAt: serialized, createdAt: serialized },
    { currentStamps: "2", lifetimeStamps: 0, stampTarget: 10, rewardsEarned: 1, rewardsRedeemed: 0, lastStampAt: serialized },
    { now: new Date(date.getTime() + 1_000), timeZone: "UTC", stampTransactions }
  );

  assert.equal(display.customerId, "#4EIUHB");
  assert.equal(display.customerCode, "#4EIUHB");
  assert.equal(display.customerId.includes("uid-123"), false);
  assert.equal(display.currentStamps, 2);
  assert.equal(display.stampProgress, "2/10");
  assert.equal(display.lifetimeStamps, 2);
  assert.equal(display.totalVisits, "2");
  assert.equal(display.lastVisit, "Oct 7, 2026, 09:42 AM");
  assert.equal(display.lastStamp, "Oct 7, 2026, 09:42 AM");
  assert.equal(display.cooldownState, "active");
  assert.equal(display.cooldownEligible, false);
  assert.equal(display.cooldownLabel, "Cooldown active");
  assert.equal(display.cooldownRemaining, "11h 59m 59s");
  assert.equal(display.rewardsEarned, 1);
  assert.equal(display.rewardsRedeemed, 0);
  assert.equal(display.name, "Kai");
});

test("missing customer data displays em dashes and never falls back to Firebase UID", () => {
  const display = mapCustomerForDisplay("private-firebase-uid", { uid: "private-firebase-uid" }, null);
  assert.equal(display.customerId, "—");
  assert.equal(display.name, "—");
  assert.equal(display.phone, "—");
  assert.equal(display.email, "—");
  assert.equal(display.totalVisits, "—");
  assert.equal(display.lastVisit, "—");
  assert.equal(display.currentStampsDisplay, "—");
  assert.equal(display.lifetimeStamps, null);
  assert.equal(display.cooldownState, "unknown");
  assert.equal(display.cooldownEligible, null);
  assert.equal(display.cooldownLabel, "—");
  assert.equal(display.cooldownRemaining, "—");
});

test("loyalty mapper follows the deployed Staff stamps field and accepts canonical counters", () => {
  const account = mapLoyaltyAccount({
    clientId: "client_bake",
    customerId: "uid-123",
    currentStamps: "2",
    stamps: 7,
    lifetimeStamps: 12,
    rewardsEarned: 2,
    totalRewardsRedeemed: 1,
    lastStampAt: serialized,
  }, "client_bake", "uid-123");
  assert.equal(account.currentStamps, 7);
  assert.equal(account.stamps, 7);
  assert.equal(account.lifetimeStamps, 12);
  assert.equal(account.rewardsEarned, 2);
  assert.equal(account.rewardsRedeemed, 1);
});

test("stamp cooldown is exactly 12 hours and missing lastStampAt is not treated as eligible", () => {
  const now = date.getTime() + STAMP_COOLDOWN_MS - 1;
  const active = getStampCooldown(date, now);
  assert.equal(active.state, "active");
  assert.equal(active.eligible, false);
  assert.equal(active.remainingMs, 1);
  assert.equal(active.nextStampAt?.getTime(), date.getTime() + 12 * 60 * 60 * 1000);
  assert.equal(active.label, "Cooldown active");
  const elapsed = getStampCooldown(date, date.getTime() + STAMP_COOLDOWN_MS);
  assert.equal(elapsed.state, "elapsed");
  assert.equal(elapsed.eligible, true);
  assert.equal(elapsed.remainingMs, 0);
  assert.equal(formatCooldownRemaining(1), "0h 00m 01s");
  assert.equal(formatCooldownRemaining(1_000), "0h 00m 01s");
  assert.equal(formatCooldownRemaining(12 * 60 * 60 * 1000), "12h 00m 00s");
  assert.equal(formatCooldownRemaining(null), "—");
  assert.equal(getStampCooldown(null, now).state, "unknown");
  assert.equal(getStampCooldown("malformed", now).label, "—");
});

test("stamp history preserves lifetime totals and only counts valid owned awards", () => {
  const history = summarizeStampHistory([
    { id: "one", data: { clientId: "client_bake", customerId: "c1", amount: 1, createdAt: serialized, visitCounted: true } },
    { id: "two", data: { clientId: "client_bake", customerId: "c1", amount: "2", createdAt: serialized } },
    { id: "uncounted", data: { clientId: "client_bake", customerId: "c1", amount: 9, visitCounted: false } },
    { id: "failed", data: { clientId: "client_bake", customerId: "c1", status: "failed", amount: 1 } },
    { id: "other", data: { clientId: "client_other", customerId: "c1", amount: 1 } },
    { id: "wrong-customer", data: { clientId: "client_bake", customerId: "c2", amount: 1 } },
  ], "client_bake", "c1");
  assert.equal(history.awardedStamps, 3);
  assert.equal(history.transactionCount, 2);
  assert.equal(history.countedVisits, 1);
  assert.equal(reconcileLifetimeStamps({ currentStamps: 2, lifetimeStamps: 8 }, history), 8);
  assert.equal(reconcileLifetimeStamps({ currentStamps: 2 }, history), 3);
});

test("stamp history rows show customer, staff, type, timestamp, and amount safely", () => {
  const row = mapStampTransactionForDisplay("tx-1", {
    type: "VISIT_STAMP",
    source: "counter",
    customerId: "uid-123",
    staffName: "Rahul Bhati",
    staffRole: "staff",
    createdAt: serialized,
    amount: 1,
  }, { name: "Kai", customerCode: "4EIUHB" });
  assert.deepEqual(row, {
    transactionId: "tx-1",
    type: "Visit stamp (counter)",
    customer: "Kai · #4EIUHB",
    staff: "Rahul Bhati · STAFF",
    timestamp: "Oct 7, 2026, 09:42 AM",
    amount: "+1",
  });
});

test("anonymous feedback mapper normalizes status and never returns customer identity", () => {
  const feedback = mapFeedbackForDisplay("f1", {
    message: "All good but staff is very good 😁",
    rating: "5",
    status: "PENDING",
    createdAt: serialized,
    customerId: "must-not-be-returned",
    name: "Kai",
    phone: "+919876543210",
  });
  assert.equal(feedback.message, "All good but staff is very good 😁");
  assert.equal(feedback.timestamp, "Oct 7, 2026, 09:42 AM");
  assert.equal(feedback.status, "New");
  assert.equal(feedback.rating, 5);
  assert.equal("customerId" in feedback, false);
  assert.equal("name" in feedback, false);
  assert.equal(mapFeedbackStatus("in_progress"), "Read");
  assert.equal(mapFeedbackStatus("resolved"), "Resolved");
  assert.equal(mapFeedbackStatus("unrecognized"), "—");
});

test("reward analytics understands both loyalty counters and the deployed Staff ledger schema", () => {
  const analytics = calculateRewardAnalytics(
    [
      { id: "c1", data: { clientId: "client_bake", customerId: "c1", currentStamps: 2, lifetimeStamps: 20, rewardsEarned: 3, rewardsRedeemed: 1 } },
      { id: "c2", data: { clientId: "client_bake", customerId: "c2", stamps: 2, totalRewardsRedeemed: 1, isEligibleForReward: true } },
    ],
    [
      { id: "redemption-1", data: { clientId: "client_bake", customerId: "c1", status: "completed" } },
      { id: "redemption-2", data: { clientId: "client_bake", customerId: "c1", status: "failed" } },
    ],
    "client_bake",
    [
      { id: "crossing", data: { clientId: "client_bake", customerId: "c2", type: "STAMP_ADDED", visitCounted: true, stampCountBefore: 7, stampCountAfter: 8, stampTarget: 8 } },
      { id: "extra-over-target", data: { clientId: "client_bake", customerId: "c2", type: "STAMP_ADDED", visitCounted: true, stampCountBefore: 8, stampCountAfter: 9, stampTarget: 8, rewardUnlocked: true } },
      { id: "reservation", data: { clientId: "client_bake", customerId: "c2", type: "STAMP_ADDED", visitCounted: false, stampCountBefore: 7, stampCountAfter: 8, stampTarget: 8 } },
    ]
  );
  assert.deepEqual(analytics, { rewardsEarned: 5, rewardsRedeemed: 2 });
});

test("activity rows use stored timestamps and do not invent records", () => {
  const activity = mapActivityForDisplay("activity-1", { type: "STAMP_ADDED", createdAt: serialized, staffName: "Rahul Bhati" });
  assert.equal(activity.activity, "Stamp Added");
  assert.equal(activity.timestamp, "Oct 7, 2026, 09:42 AM");
  assert.equal(activity.actor, "Rahul Bhati");
  const empty = mapActivityForDisplay("activity-2", {});
  assert.equal(empty.activity, "—");
  assert.equal(empty.timestamp, "—");
});

test("staff visit transaction retries do not count an already-counted transaction twice", () => {
  const makeSnapshot = (data: Record<string, unknown>) => ({
    exists: () => true,
    get: (field: string) => data[field],
  }) as unknown as DocumentSnapshot;
  const prepared = {
    customerRef: {} as PreparedVisit["customerRef"],
    txRef: {} as PreparedVisit["txRef"],
    customerSnap: makeSnapshot({ totalVisits: 1 }),
    txSnap: makeSnapshot({ visitCounted: false }),
    transactionId: "tx-visit-1",
  } satisfies PreparedVisit;
  let customerUpdates = 0;
  let transactionWrites = 0;
  const fakeTransaction = {
    update: () => { customerUpdates += 1; },
    set: () => { transactionWrites += 1; },
  } as unknown as Transaction;

  assert.deepEqual(commitVisit(fakeTransaction, prepared), { counted: true, totalVisits: 2 });
  const replay = commitVisit(fakeTransaction, {
    ...prepared,
    customerSnap: makeSnapshot({ totalVisits: 2 }),
    txSnap: makeSnapshot({ visitCounted: true }),
  });
  assert.deepEqual(replay, { counted: false, reason: "already-counted", totalVisits: 2 });
  assert.equal(customerUpdates, 1);
  assert.equal(transactionWrites, 1);
});

test("Admin view model uses tenant target and only exposes persisted Firebase metrics", () => {
  const view = buildAdminPanelViewModel({
    scope: { clientId: "client_bake", isSuperAdmin: false },
    clientConfig: { loyalty: { stampTarget: 10 } },
    reviews: [{ id: "review-1", data: { clientId: "client_bake", overallRating: 5, createdAt: serialized } }],
    feedback: [],
    customers: [{
      id: "uid-private",
      data: { uid: "uid-private", clientId: "client_bake", customerCode: "4EIUHB", name: "Kai", totalVisits: 2, createdAt: serialized },
    }],
    loyaltyAccounts: [{
      id: "uid-private",
      data: { clientId: "client_bake", customerId: "uid-private", stamps: 2, lifetimeStamps: 8, totalRewardsRedeemed: 1, isEligibleForReward: true },
    }],
    stampTransactions: [{
      id: "threshold-crossing",
      data: { clientId: "client_bake", customerId: "uid-private", type: "STAMP_ADDED", visitCounted: true, stampCountBefore: 7, stampCountAfter: 8, stampTarget: 8 },
    }],
    rewardRedemptions: [{
      id: "reward-redemption",
      data: { clientId: "client_bake", customerId: "uid-private", status: "completed" },
    }],
    activityLogs: [],
    metricsDaily: [
      { id: "day-old", data: { clientId: "client_bake", date: "2026-10-06", visits: 2 } },
      { id: "day-new", data: { clientId: "client_bake", date: "2026-10-07", visits: 3 } },
    ],
  }, date);

  assert.equal(view.customers[0]?.customerId, "#4EIUHB");
  assert.equal(view.customers[0]?.stampProgress, "2/10");
  assert.equal(view.customers[0]?.lifetimeStamps, 8);
  assert.equal(view.customers[0]?.rewardsEarned, 2);
  assert.equal(view.customers[0]?.rewardsRedeemed, 1);
  assert.deepEqual(view.metricsDaily.map((row) => row.id), ["day-new", "day-old"]);
  assert.equal(view.reviewAnalytics.averageDisplay, "5.0");
  assert.equal(view.totalVisits, 2);
  assert.deepEqual(view.rewards, { rewardsEarned: 2, rewardsRedeemed: 1 });
  assert.deepEqual(view.activity, []);
  assert.deepEqual(view.notifications, []);
});
