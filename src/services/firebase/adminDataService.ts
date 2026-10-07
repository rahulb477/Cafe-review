"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  type DocumentData,
  type QueryConstraint,
} from "firebase/firestore";
import { getDb, getFirebaseAuth } from "./firebaseClient";
import { mapActivityForDisplay, mapFeedbackForDisplay, calculateRewardAnalytics, calculateRewardCountsByCustomer } from "@/shared/adminRecords";
import { mapCustomerForDisplay, dedupeCustomers, type CustomerDisplay } from "@/shared/customerDisplay";
import { summarizeStampHistory, mapStampTransactionForDisplay, safeCountValue, type StampTransactionDisplay } from "@/shared/loyaltyDisplay";
import { parseFirestoreTimestamp } from "@/shared/firestoreTimestamp";
import { calculateReviewAnalytics, normalizeReviewRecord, type NormalizedReview, type ReviewAnalytics } from "@/shared/reviewAnalytics";

export interface AdminDataRow {
  id: string;
  data: Record<string, unknown>;
}

export interface AdminDataScope {
  clientId: string;
  isSuperAdmin: boolean;
}

export interface AdminPanelData {
  scope: AdminDataScope;
  clientConfig: Record<string, unknown> | null;
  reviews: AdminDataRow[];
  feedback: AdminDataRow[];
  customers: AdminDataRow[];
  loyaltyAccounts: AdminDataRow[];
  stampTransactions: AdminDataRow[];
  rewardRedemptions: AdminDataRow[];
  activityLogs: AdminDataRow[];
  metricsDaily: AdminDataRow[];
}

export interface AdminPanelViewModel {
  scope: AdminDataScope;
  customers: CustomerDisplay[];
  customerRecordCount: number;
  totalVisits: number;
  successfulStampCount: number;
  potentialDuplicateGroups: Array<{ key: string; canonicalCode: string; duplicateCodes: string[] }>;
  reviews: NormalizedReview[];
  reviewAnalytics: ReviewAnalytics;
  feedback: ReturnType<typeof mapFeedbackForDisplay>[];
  stampTransactions: StampTransactionDisplay[];
  rewards: ReturnType<typeof calculateRewardAnalytics>;
  /** Stored daily aggregates, kept in their canonical schema and tenant scope. */
  metricsDaily: AdminDataRow[];
  activity: ReturnType<typeof mapActivityForDisplay>[];
  /** Notifications are a filtered view of real activityLogs; no demo rows are added. */
  notifications: ReturnType<typeof mapActivityForDisplay>[];
}

function newestFirst(rows: AdminDataRow[], fields: string[]): AdminDataRow[] {
  return [...rows].sort((left, right) => {
    const leftValue = fields.map((field) => parseFirestoreTimestamp(left.data[field])?.getTime()).find((value) => value !== undefined) ?? 0;
    const rightValue = fields.map((field) => parseFirestoreTimestamp(right.data[field])?.getTime()).find((value) => value !== undefined) ?? 0;
    return rightValue - leftValue;
  });
}

/** Maps fresh canonical Firebase reads to UI-safe Admin data without exposing customer UIDs. */
export function buildAdminPanelViewModel(data: AdminPanelData, now: Date | number = new Date()): AdminPanelViewModel {
  const clientId = data.scope.clientId;
  const clientLoyalty = data.clientConfig?.loyalty && typeof data.clientConfig.loyalty === "object"
    ? data.clientConfig.loyalty as Record<string, unknown>
    : {};
  const tenantStampTarget = clientLoyalty.stampTarget;
  const activeCustomerRows = data.customers.filter((row) => row.data.status !== "merged");
  const duplicateReport = dedupeCustomers(activeCustomerRows.map((row) => ({ id: row.id, data: row.data })));
  const customersById = new Map(activeCustomerRows.map((row) => [row.id, row.data]));
  const loyaltyById = new Map(data.loyaltyAccounts.map((row) => [row.id, row.data]));
  const historyByCustomer = new Map<string, typeof data.stampTransactions>();

  for (const transaction of data.stampTransactions) {
    const customerId = typeof transaction.data.customerId === "string" ? transaction.data.customerId : "";
    if (!customerId) continue;
    const bucket = historyByCustomer.get(customerId) ?? [];
    bucket.push(transaction);
    historyByCustomer.set(customerId, bucket);
  }

  const rewardCountsByCustomer = calculateRewardCountsByCustomer(
    data.loyaltyAccounts,
    data.rewardRedemptions,
    clientId,
    data.stampTransactions
  );
  const customerDisplays = activeCustomerRows.map((row) => {
    const customerId = typeof row.data.customerId === "string" ? row.data.customerId : row.id;
    const account = loyaltyById.get(row.id) ?? loyaltyById.get(customerId) ?? {};
    const rewardCounts = rewardCountsByCustomer.get(customerId);
    return mapCustomerForDisplay(
      row.id,
      row.data,
      { ...account, ...(rewardCounts ?? {}) },
      { now, stampTransactions: historyByCustomer.get(row.id) ?? [], stampTarget: tenantStampTarget }
    );
  });

  const reviewRows = newestFirst(data.reviews, ["createdAt"]).map((row) => normalizeReviewRecord(row.id, row.data));
  const feedbackRows = newestFirst(data.feedback, ["createdAt", "timestamp"]).map((row) => mapFeedbackForDisplay(row.id, row.data));
  const stampRows = newestFirst(data.stampTransactions, ["createdAt", "timestamp", "transactionAt"]).map((row) => mapStampTransactionForDisplay(
    row.id,
    row.data,
    typeof row.data.customerId === "string" ? customersById.get(row.data.customerId) : undefined
  ));
  const activity = newestFirst(data.activityLogs, ["createdAt", "timestamp", "updatedAt"])
    .map((row) => mapActivityForDisplay(row.id, row.data));

  let successfulStampCount = 0;
  const totalVisits = activeCustomerRows.reduce((sum, row) => {
    const history = summarizeStampHistory(historyByCustomer.get(row.id) ?? [], clientId, row.id);
    successfulStampCount += history.awardedStamps;
    return sum + Math.max(safeCountValue(row.data.totalVisits) ?? 0, history.countedVisits);
  }, 0);

  const customerCodesById = new Map(activeCustomerRows.map((row) => [row.id, mapCustomerForDisplay(
    row.id,
    row.data,
    loyaltyById.get(row.id) ?? null,
    { now, stampTransactions: historyByCustomer.get(row.id) ?? [], stampTarget: tenantStampTarget }
  ).customerCode]));

  return {
    scope: data.scope,
    customers: customerDisplays,
    customerRecordCount: activeCustomerRows.length,
    totalVisits,
    successfulStampCount,
    potentialDuplicateGroups: duplicateReport.duplicateGroups.map((group) => ({
      key: group.key,
      canonicalCode: customerCodesById.get(group.canonicalId) ?? "—",
      duplicateCodes: group.duplicateIds.map((id) => customerCodesById.get(id) ?? "—"),
    })),
    reviews: reviewRows,
    reviewAnalytics: calculateReviewAnalytics(data.reviews),
    feedback: feedbackRows,
    stampTransactions: stampRows,
    rewards: calculateRewardAnalytics(data.loyaltyAccounts, data.rewardRedemptions, clientId, data.stampTransactions),
    metricsDaily: newestFirst(data.metricsDaily, ["date", "day", "createdAt"]),
    activity,
    notifications: activity.filter((item) => /notification|alert/i.test(item.activity)),
  };
}

function plainData(data: DocumentData): Record<string, unknown> {
  return data as Record<string, unknown>;
}

function active(profile: Record<string, unknown>): boolean {
  const status = typeof profile.status === "string" ? profile.status.toLowerCase() : "active";
  return profile.active !== false && !["disabled", "inactive", "suspended", "blocked"].includes(status);
}

function superAdmin(profile: Record<string, unknown>, claimRole?: unknown): boolean {
  const role = typeof profile.role === "string" ? profile.role.toLowerCase().replace(/[\s-]+/g, "_") : "";
  const claim = typeof claimRole === "string" ? claimRole.toLowerCase().replace(/[\s-]+/g, "_") : "";
  return profile.isSuperAdmin === true
    || profile.superAdmin === true
    || ["super_admin", "superadmin"].includes(role)
    || ["super_admin", "superadmin"].includes(claim);
}

/**
 * Resolves the logged-in admin's single assigned client from admins/{uid}.
 * No caller, including a Super Admin, can widen this Admin-data read scope with
 * a requested clientId; cross-client privileges remain outside this data service.
 */
export async function getAdminDataScope(requestedClientId?: string): Promise<AdminDataScope> {
  const db = getDb();
  const user = getFirebaseAuth()?.currentUser;
  if (!db || !user) throw new Error("admin-auth-required");

  const adminSnapshot = await getDoc(doc(db, "admins", user.uid));
  if (!adminSnapshot.exists()) throw new Error("admin-profile-not-found");
  const profile = plainData(adminSnapshot.data());
  if (!active(profile)) throw new Error("admin-inactive");

  const token = await user.getIdTokenResult();
  const isSuperAdmin = superAdmin(profile, token.claims.role);
  const assignedClientId = typeof profile.clientId === "string" && profile.clientId.trim() ? profile.clientId.trim() : null;
  const validClientId = (value: string | null): value is string => !!value && /^[\w-]{1,128}$/.test(value);

  if (!validClientId(assignedClientId)) throw new Error("admin-client-assignment-missing");
  if (requestedClientId?.trim() && requestedClientId.trim() !== assignedClientId) throw new Error("admin-client-scope-violation");
  return { clientId: assignedClientId, isSuperAdmin };
}

async function readCollection(path: string, clientId: string, scoped: boolean): Promise<AdminDataRow[]> {
  const db = getDb();
  if (!db) throw new Error("firebase-disabled");
  const constraints: QueryConstraint[] = scoped ? [where("clientId", "==", clientId)] : [];
  const result = await getDocs(query(collection(db, path), ...constraints));
  return result.docs.map((snapshot) => ({ id: snapshot.id, data: plainData(snapshot.data()) }));
}

/** Fresh, client-scoped reads from the canonical Firebase collections. */
export async function loadAdminPanelData(requestedClientId?: string): Promise<AdminPanelData> {
  const scope = await getAdminDataScope(requestedClientId);
  const { clientId } = scope;
  const db = getDb();
  if (!db) throw new Error("firebase-disabled");
  const nested = (name: string) => `clients/${clientId}/${name}`;

  const [clientSnapshot, reviews, feedback, customers, loyaltyAccounts, stampTransactions, rewardRedemptions, activityLogs, metricsDaily] = await Promise.all([
    getDoc(doc(db, "clients", clientId)),
    readCollection(nested("reviews"), clientId, false),
    readCollection(nested("feedback"), clientId, false),
    readCollection("customers", clientId, true),
    readCollection("loyaltyAccounts", clientId, true),
    readCollection(nested("stampTransactions"), clientId, false),
    readCollection(nested("rewardRedemptions"), clientId, false),
    readCollection("activityLogs", clientId, true),
    readCollection("metricsDaily", clientId, true),
  ]);

  // Defend against malformed or wrongly indexed documents even though rules
  // scope reads and the customer-facing mappings validate ownership again.
  const belongsToClient = (row: AdminDataRow) => !row.data.clientId || row.data.clientId === clientId;
  return {
    scope,
    clientConfig: clientSnapshot.exists() ? plainData(clientSnapshot.data()) : null,
    reviews: reviews.filter(belongsToClient),
    feedback: feedback.filter(belongsToClient),
    customers: customers.filter(belongsToClient),
    loyaltyAccounts: loyaltyAccounts.filter(belongsToClient),
    stampTransactions: stampTransactions.filter(belongsToClient),
    rewardRedemptions: rewardRedemptions.filter(belongsToClient),
    activityLogs: activityLogs.filter(belongsToClient),
    metricsDaily: metricsDaily.filter(belongsToClient),
  };
}
