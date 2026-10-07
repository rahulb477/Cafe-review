#!/usr/bin/env node
/**
 * Duplicate-candidate audit and guarded customer merge tool.
 *
 *   node scripts/dedupe-customers.mjs --dry-run
 *   node scripts/dedupe-customers.mjs --dry-run --client <clientId>
 *   node scripts/dedupe-customers.mjs --index-only --apply
 *   node scripts/dedupe-customers.mjs --merge-group <phoneIndexId> --apply
 *
 * Dry-run is the default. Matching is only by clientId + normalized phone;
 * matching names are never sufficient. A merge requires an explicit group key
 * copied from a reviewed dry-run. Historical transaction/reward/review/token
 * documents are repointed, never deleted. Duplicate customer/account documents
 * are archived and soft-marked; this tool does not delete customer history.
 *
 * `--index-only --apply` creates only missing phone indexes. For a duplicate
 * candidate group, the index is created only if that exact group is explicitly
 * listed with `--confirm-group <phoneIndexId>`.
 *
 * Credentials (Admin SDK bypasses Firestore Rules; run on a trusted operator machine):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/service-account.json
 *   or FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",…}'
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 for emulator testing.
 */
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { normalizeIndianPhone, phoneIndexKey, PHONE_INDEX_COLLECTION } from "../src/shared/phone.ts";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
};
const options = (name) => {
  const prefix = `--${name}=`;
  return argv.flatMap((arg, index) => arg.startsWith(prefix) ? [arg.slice(prefix.length)] : arg === `--${name}` && argv[index + 1] ? [argv[index + 1]] : []);
};

if (flag("help")) {
  console.log("Usage: node scripts/dedupe-customers.mjs [--dry-run] [--client <id>] [--phone <phone>] [--json]");
  console.log("       node scripts/dedupe-customers.mjs --index-only --apply [--confirm-group <phoneIndexId>]");
  console.log("       node scripts/dedupe-customers.mjs --merge-group <phoneIndexId> --apply");
  process.exit(0);
}

const APPLY = flag("apply");
const DELETE = flag("delete");
const INDEX_ONLY = flag("index-only");
const MERGE_GROUP = option("merge-group");
const CONFIRMED_GROUPS = options("confirm-group");
const ONLY_CLIENT = option("client");
const RAW_PHONE = option("phone");
const ONLY_PHONE = RAW_PHONE ? normalizeIndianPhone(RAW_PHONE) : null;
const PROJECT = option("project") ?? "cafe-review7";
const JSON_OUTPUT = flag("json");

if (DELETE) throw new Error("Deletion is disabled. Merges keep customer/account archives and all historical transactions.");
if (APPLY && flag("dry-run")) throw new Error("Choose either --dry-run or --apply, not both");
if (MERGE_GROUP && !APPLY) throw new Error("--merge-group requires --apply");
if (MERGE_GROUP && INDEX_ONLY) throw new Error("--merge-group cannot be combined with --index-only");
if (APPLY && !INDEX_ONLY && !MERGE_GROUP) throw new Error("--apply requires --index-only or one explicit --merge-group <phoneIndexId>");
if (RAW_PHONE && !ONLY_PHONE) throw new Error("--phone must be a valid Indian mobile number");
if (ONLY_CLIENT && !/^[\w-]{1,128}$/.test(ONLY_CLIENT)) throw new Error("Invalid --client value");
if (PROJECT !== "cafe-review7" && !process.env.FIRESTORE_EMULATOR_HOST) throw new Error(`Refusing to run against project \"${PROJECT}\"`);

const credential = process.env.FIRESTORE_EMULATOR_HOST
  ? undefined
  : process.env.FIREBASE_SERVICE_ACCOUNT
    ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    : applicationDefault();
initializeApp({ projectId: PROJECT, ...(credential ? { credential } : {}) });
const db = getFirestore();

const log = (...args) => !JSON_OUTPUT && console.log(...args);

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function count(value) {
  if (typeof value === "string" && value.trim() === "") return null;
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

function millis(value) {
  if (value == null) return null;
  if (typeof value.toMillis === "function") {
    try {
      const ms = value.toMillis();
      return Number.isFinite(ms) ? ms : null;
    } catch {
      return null;
    }
  }
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === "object") {
    const v = value;
    const seconds = typeof v.seconds === "number" ? v.seconds : typeof v._seconds === "number" ? v._seconds : null;
    const nanos = typeof v.nanoseconds === "number" ? v.nanoseconds : typeof v._nanoseconds === "number" ? v._nanoseconds : 0;
    if (seconds === null || !Number.isInteger(seconds) || !Number.isInteger(nanos) || nanos < 0 || nanos >= 1_000_000_000) return null;
    const ms = seconds * 1000 + nanos / 1_000_000;
    return Number.isFinite(ms) && Number.isFinite(new Date(ms).getTime()) ? ms : null;
  }
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return null;
    const parsed = /^-?\d+(?:\.\d+)?$/.test(raw)
      ? (() => { const n = Number(raw); return Math.abs(n) < 100_000_000_000 ? n * 1000 : n; })()
      : Date.parse(raw);
    return Number.isFinite(parsed) && Number.isFinite(new Date(parsed).getTime()) ? parsed : null;
  }
  return null;
}

function profileValid(data) {
  return typeof data.name === "string" && data.name.trim().length >= 2 && !!normalizeIndianPhone(data.normalizedPhone ?? data.phone);
}

function historyAmount(data) {
  for (const key of ["stampsAwarded", "stampAmount", "amount", "stampDelta", "delta"]) {
    if (!(key in data)) continue;
    const value = typeof data[key] === "string" ? Number(data[key]) : data[key];
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }
  return 1;
}

function invalidHistory(data) {
  if (data.success === false || data.succeeded === false || data.isSuccessful === false) return true;
  if (data.voided === true || data.reversed === true || data.isReversed === true || data.deleted === true) return true;
  const status = [data.status, data.state, data.result].filter((value) => typeof value === "string").join(" ").toLowerCase();
  const type = [data.type, data.transactionType, data.action].filter((value) => typeof value === "string").join(" ").toLowerCase();
  return /(failed|failure|cancelled|canceled|reversed|voided|rejected|pending|error)/.test(status)
    || /(redeem|redemption|remove|deduct|debit|refund|reversal|void|cancel)/.test(type);
}

function summarizeStampTransactions(rows, clientId, customerId) {
  let awarded = 0;
  let countedVisits = 0;
  let latestStamp = null;
  let latestVisit = null;
  for (const snapshot of rows) {
    const data = snapshot.data();
    if (data.customerId !== customerId || (data.clientId && data.clientId !== clientId) || invalidHistory(data)) continue;
    const amount = historyAmount(data);
    if (amount <= 0) continue;
    awarded += amount;
    const at = millis(data.createdAt ?? data.timestamp ?? data.transactionAt);
    if (at !== null && (latestStamp === null || at > latestStamp)) latestStamp = at;
    if (data.visitCounted === true) {
      countedVisits += 1;
      const visitAt = millis(data.visitCountedAt ?? data.createdAt ?? data.timestamp ?? data.transactionAt);
      if (visitAt !== null && (latestVisit === null || visitAt > latestVisit)) latestVisit = visitAt;
    }
  }
  return { awarded, countedVisits, latestStamp, latestVisit };
}

function redemptionCount(rows, clientId, customerId) {
  return rows.filter((snapshot) => {
    const data = snapshot.data();
    const status = [data.status, data.state, data.result].filter((value) => typeof value === "string").join(" ").toLowerCase();
    return data.customerId === customerId
      && (!data.clientId || data.clientId === clientId)
      && data.success !== false
      && data.reversed !== true
      && data.voided !== true
      && data.cancelled !== true
      && !/(failed|failure|cancel|reverse|void|reject|error|pending)/.test(status);
  }).length;
}

function memberCurrentStamps(member) {
  return count(member.loyalty?.currentStamps) ?? count(member.loyalty?.stamps);
}

function profileFingerprint(data) {
  return JSON.stringify([
    data.clientId,
    normalizeIndianPhone(data.normalizedPhone ?? data.phone),
    data.uid,
    data.customerCode ?? data.code ?? data.customerNumber,
    data.name,
    count(data.totalVisits),
    millis(data.createdAt),
    millis(data.lastVisitAt),
    millis(data.updatedAt),
    data.status,
  ]);
}

function loyaltyFingerprint(data) {
  if (!data) return null;
  return JSON.stringify([
    data.clientId,
    data.customerId,
    count(data.currentStamps),
    count(data.stamps),
    count(data.lifetimeStamps),
    count(data.rewardsEarned),
    count(data.rewardsRedeemed),
    millis(data.lastStampAt),
    millis(data.updatedAt),
    data.status,
  ]);
}

async function refsFor(clientId, customerId) {
  const paths = [
    `clients/${clientId}/stampTransactions`,
    `clients/${clientId}/rewardRedemptions`,
    `clients/${clientId}/reviews`,
    "customerTokens",
  ];
  const results = await Promise.all(paths.map((path) => db.collection(path).where("customerId", "==", customerId).get()));
  return results.flatMap((snapshot) => snapshot.docs);
}

async function inspectGroup(group) {
  const indexRef = db.doc(`${PHONE_INDEX_COLLECTION}/${phoneIndexKey(group.clientId, group.phone)}`);
  const [indexSnapshot, members] = await Promise.all([
    indexRef.get(),
    Promise.all(group.members.map(async (member) => {
      const [loyaltySnapshot, stampSnapshot, redemptionSnapshot, tokenSnapshot] = await Promise.all([
        db.doc(`loyaltyAccounts/${member.uid}`).get(),
        db.collection(`clients/${group.clientId}/stampTransactions`).where("customerId", "==", member.uid).get(),
        db.collection(`clients/${group.clientId}/rewardRedemptions`).where("customerId", "==", member.uid).get(),
        db.collection("customerTokens").where("customerId", "==", member.uid).get(),
      ]);
      const detailed = {
        ...member,
        loyalty: loyaltySnapshot.exists ? loyaltySnapshot.data() : null,
        loyaltyExists: loyaltySnapshot.exists,
        stampDocs: stampSnapshot.docs,
        redemptionDocs: redemptionSnapshot.docs,
        tokenDocs: tokenSnapshot.docs,
      };
      detailed.stampSummary = summarizeStampTransactions(detailed.stampDocs, group.clientId, member.uid);
      detailed.redemptions = redemptionCount(detailed.redemptionDocs, group.clientId, member.uid);
      return detailed;
    })),
  ]);
  return {
    key: phoneIndexKey(group.clientId, group.phone),
    indexExists: indexSnapshot.exists,
    indexOwner: indexSnapshot.exists ? indexSnapshot.data().customerId ?? null : null,
    members,
  };
}

function createdMillis(member) {
  return millis(member.data.createdAt) ?? Number.POSITIVE_INFINITY;
}

function canonicalOrder(a, b) {
  const aLifetime = count(a.loyalty?.lifetimeStamps) ?? memberCurrentStamps(a) ?? 0;
  const bLifetime = count(b.loyalty?.lifetimeStamps) ?? memberCurrentStamps(b) ?? 0;
  const aCode = text(a.data.customerCode ?? a.data.code ?? a.data.customerNumber) ? 1 : 0;
  const bCode = text(b.data.customerCode ?? b.data.code ?? b.data.customerNumber) ? 1 : 0;
  return Number(profileValid(b.data)) - Number(profileValid(a.data))
    || Number(b.loyaltyExists) - Number(a.loyaltyExists)
    || bCode - aCode
    || createdMillis(a) - createdMillis(b)
    || bLifetime - aLifetime
    || count(b.data.totalVisits) - count(a.data.totalVisits)
    || a.uid.localeCompare(b.uid);
}

function summarizeGroup(group, inspected) {
  const members = [...inspected.members].sort(canonicalOrder);
  const canonical = members[0];
  const duplicates = members.slice(1);
  const noForeignIndexOwner = !inspected.indexOwner || members.some((member) => member.uid === inspected.indexOwner);
  return {
    clientId: group.clientId,
    normalizedPhone: group.phone,
    phoneIndexId: inspected.key,
    canonical: canonical.uid,
    phoneIndex: { exists: inspected.indexExists, owner: inspected.indexOwner, conflict: !noForeignIndexOwner },
    duplicateCandidates: members.map((member) => {
      const history = member.stampSummary;
      const qrTokens = new Set([
        ...(typeof member.data.qrToken === "string" ? [member.data.qrToken] : []),
        ...member.tokenDocs.map((token) => token.id),
      ]);
      return {
        uid: member.uid,
        profileUid: text(member.data.uid),
        customerCode: text(member.data.customerCode ?? member.data.code ?? member.data.customerNumber),
        name: text(member.data.name),
        createdAt: millis(member.data.createdAt) === null ? null : new Date(millis(member.data.createdAt)).toISOString(),
        hasLoyaltyAccount: member.loyaltyExists,
        currentStamps: memberCurrentStamps(member),
        lifetimeStamps: count(member.loyalty?.lifetimeStamps),
        rewardsEarned: count(member.loyalty?.rewardsEarned),
        rewardsRedeemed: count(member.loyalty?.rewardsRedeemed),
        totalVisits: count(member.data.totalVisits),
        stampTransactionCount: member.stampDocs.length,
        validHistoricalStamps: history.awarded,
        validCountedVisits: history.countedVisits,
        rewardHistoryCount: member.redemptionDocs.length,
        validRewardRedemptions: member.redemptions,
        qrTokenCount: qrTokens.size,
        uidMatchesDocumentId: member.data.uid === member.uid,
      };
    }),
    confirmedByExplicitPhoneKey: false,
  };
}

function memberMergeValues(member) {
  const current = memberCurrentStamps(member);
  const history = member.stampSummary;
  const lifetime = Math.max(
    count(member.loyalty?.lifetimeStamps) ?? 0,
    current ?? 0,
    history.awarded
  );
  const storedVisits = count(member.data.totalVisits) ?? 0;
  const visits = Math.max(storedVisits, history.countedVisits);
  const redeemed = Math.max(count(member.loyalty?.rewardsRedeemed) ?? 0, member.redemptions);
  const earned = count(member.loyalty?.rewardsEarned);
  const lastStampAt = Math.max(millis(member.loyalty?.lastStampAt) ?? 0, history.latestStamp ?? 0) || null;
  const lastVisitAt = Math.max(millis(member.data.lastVisitAt) ?? 0, history.latestVisit ?? 0) || null;
  const createdAt = millis(member.data.createdAt);
  return { current, lifetime, visits, redeemed, earned, lastStampAt, lastVisitAt, createdAt };
}

function aggregateMembers(members) {
  const values = members.map(memberMergeValues);
  const currentIsKnown = members.every((member, index) => values[index].current !== null || member.stampSummary.awarded === 0);
  if (!currentIsKnown) throw new Error("A member has stamp history but no current balance; reconcile before merging.");
  const lifetimeKnown = members.every((member) =>
    count(member.loyalty?.lifetimeStamps) !== null || member.stampSummary.awarded > 0
  );
  if (!lifetimeKnown) throw new Error("Lifetime history is incomplete for at least one member; reconcile/review before merging.");
  const currentStamps = values.reduce((sum, value) => sum + (value.current ?? 0), 0);
  const lifetimeStamps = values.reduce((sum, value) => sum + value.lifetime, 0);
  const rewardsRedeemed = values.reduce((sum, value) => sum + value.redeemed, 0);
  const earnedKnown = members.every((member) =>
    member.loyaltyExists
      ? count(member.loyalty?.rewardsEarned) !== null
      : member.redemptions === 0 && member.stampSummary.awarded === 0
  );
  if (!earnedKnown) throw new Error("Reward-earned counters are incomplete; no safe merge is possible until records are reconciled.");
  const rewardsEarned = values.reduce((sum, value) => sum + Math.max(value.earned ?? 0, value.redeemed), 0);
  const totalVisits = values.reduce((sum, value) => sum + value.visits, 0);
  const lastStampAt = Math.max(0, ...values.map((value) => value.lastStampAt ?? 0)) || null;
  const lastVisitAt = Math.max(0, ...values.map((value) => value.lastVisitAt ?? 0)) || null;
  const createdAt = Math.min(Infinity, ...values.map((value) => value.createdAt ?? Infinity));
  return { currentStamps, lifetimeStamps, rewardsEarned, rewardsRedeemed, totalVisits, lastStampAt, lastVisitAt, createdAt: Number.isFinite(createdAt) ? createdAt : null };
}

async function repointHistory(clientId, fromUid, toUid) {
  const refs = await refsFor(clientId, fromUid);
  for (let offset = 0; offset < refs.length; offset += 400) {
    const batch = db.batch();
    for (const ref of refs.slice(offset, offset + 400)) batch.update(ref, { customerId: toUid, originalCustomerId: fromUid });
    await batch.commit();
  }
  return refs.length;
}

async function mergeConfirmedGroup(group, inspected) {
  if (inspected.indexOwner && !inspected.members.some((member) => member.uid === inspected.indexOwner)) {
    throw new Error(`Phone index is owned by an unrelated customer (${inspected.indexOwner}); refusing to merge.`);
  }
  const members = [...inspected.members].sort(canonicalOrder);
  if (members.length < 2) throw new Error("Confirmed phone key no longer has duplicate customer records.");
  if (members.length > 200) throw new Error("This group exceeds the safe atomic merge limit; request a manually reviewed migration.");
  if (members.some((member) => member.data.status === "merged")) throw new Error("Group changed during review; merged records are excluded.");
  const canonical = members[0];
  const duplicates = members.slice(1);
  const aggregate = aggregateMembers(members);

  // Re-read customer/account/index/archive state atomically before any merge write.
  await db.runTransaction(async (transaction) => {
    const customerRefs = members.map((member) => db.doc(`customers/${member.uid}`));
    const loyaltyRefs = members.map((member) => db.doc(`loyaltyAccounts/${member.uid}`));
    const archiveRefs = duplicates.map((member) => db.doc(`customerMergeArchive/${member.uid}`));
    const [freshCustomers, freshLoyalty, freshIndex, freshArchives] = await Promise.all([
      Promise.all(customerRefs.map((ref) => transaction.get(ref))),
      Promise.all(loyaltyRefs.map((ref) => transaction.get(ref))),
      transaction.get(db.doc(`${PHONE_INDEX_COLLECTION}/${inspected.key}`)),
      Promise.all(archiveRefs.map((ref) => transaction.get(ref))),
    ]);
    if (freshCustomers.some((snapshot, index) =>
      !snapshot.exists
      || snapshot.data().status === "merged"
      || snapshot.data().clientId !== group.clientId
      || normalizeIndianPhone(snapshot.data().normalizedPhone ?? snapshot.data().phone) !== group.phone
      || profileFingerprint(snapshot.data()) !== profileFingerprint(members[index].data)
    )) {
      throw new Error("Customer records changed during merge review; rerun dry-run.");
    }
    if (freshIndex.exists && !members.some((member) => member.uid === freshIndex.data().customerId)) {
      throw new Error("Phone index changed to an unrelated owner; refusing to merge.");
    }
    if (freshArchives.some((snapshot) => snapshot.exists && snapshot.data().mergedInto !== canonical.uid)) {
      throw new Error("An archive points to a different canonical customer; refusing to overwrite it.");
    }
    if (freshLoyalty.some((snapshot, index) =>
      snapshot.exists !== members[index].loyaltyExists
      || loyaltyFingerprint(snapshot.exists ? snapshot.data() : null) !== loyaltyFingerprint(members[index].loyalty)
    )) {
      throw new Error("Loyalty account changed during merge review; rerun dry-run.");
    }

    const canonicalRef = customerRefs[0];
    const canonicalLoyaltyRef = loyaltyRefs[0];
    duplicates.forEach((duplicate, index) => {
      if (!freshArchives[index].exists) {
        transaction.create(archiveRefs[index], {
          customer: duplicate.data,
          loyalty: duplicate.loyalty,
          mergedInto: canonical.uid,
          clientId: group.clientId,
          normalizedPhone: group.phone,
          archivedAt: FieldValue.serverTimestamp(),
        });
      }
    });
    const earliestCreated = aggregate.createdAt === null ? undefined : Timestamp.fromMillis(aggregate.createdAt);
    const latestVisit = aggregate.lastVisitAt === null ? undefined : Timestamp.fromMillis(aggregate.lastVisitAt);
    transaction.update(canonicalRef, {
      normalizedPhone: group.phone,
      phone: group.phone,
      phoneIndexId: inspected.key,
      totalVisits: aggregate.totalVisits,
      ...(latestVisit ? { lastVisitAt: latestVisit } : {}),
      ...(earliestCreated ? { createdAt: earliestCreated } : {}),
      mergedCustomerIds: FieldValue.arrayUnion(...duplicates.map((member) => member.uid)),
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (freshLoyalty.some((snapshot) => snapshot.exists) || aggregate.currentStamps > 0 || aggregate.lifetimeStamps > 0) {
      transaction.set(canonicalLoyaltyRef, {
        clientId: group.clientId,
        customerId: canonical.uid,
        currentStamps: aggregate.currentStamps,
        stamps: aggregate.currentStamps,
        lifetimeStamps: aggregate.lifetimeStamps,
        ...(aggregate.rewardsEarned === null ? {} : { rewardsEarned: aggregate.rewardsEarned }),
        rewardsRedeemed: aggregate.rewardsRedeemed,
        ...(aggregate.lastStampAt === null ? {} : { lastStampAt: Timestamp.fromMillis(aggregate.lastStampAt) }),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    duplicates.forEach((duplicate, index) => {
      transaction.update(customerRefs[index + 1], {
        status: "merged",
        mergedInto: canonical.uid,
        mergedAt: FieldValue.serverTimestamp(),
      });
      if (freshLoyalty[index + 1].exists) {
        const original = freshLoyalty[index + 1].data();
        transaction.update(loyaltyRefs[index + 1], {
          currentStamps: 0,
          stamps: 0,
          status: "merged",
          mergedInto: canonical.uid,
          // lifetimeStamps and reward counters stay intact on the archived record.
          stampsBeforeMerge: count(original.currentStamps) ?? count(original.stamps) ?? 0,
        });
      }
    });

    transaction.set(db.doc(`${PHONE_INDEX_COLLECTION}/${inspected.key}`), {
      phone: group.phone,
      clientId: group.clientId,
      customerId: canonical.uid,
      ...(freshIndex.exists && freshIndex.data().createdAt ? { createdAt: freshIndex.data().createdAt } : { createdAt: FieldValue.serverTimestamp() }),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  let repointed = 0;
  for (const duplicate of duplicates) repointed += await repointHistory(group.clientId, duplicate.uid, canonical.uid);
  const leftovers = await Promise.all(duplicates.map((duplicate) => refsFor(group.clientId, duplicate.uid)));
  if (leftovers.some((refs) => refs.length)) throw new Error("Merge completed but some history references remain; rerun the script to finish repointing.");

  return {
    canonical: canonical.uid,
    merged: duplicates.map((member) => member.uid),
    currentStamps: aggregate.currentStamps,
    lifetimeStamps: aggregate.lifetimeStamps,
    rewardsEarned: aggregate.rewardsEarned,
    rewardsRedeemed: aggregate.rewardsRedeemed,
    totalVisits: aggregate.totalVisits,
    repointedHistoryDocuments: repointed,
    deleted: false,
  };
}

let customerQuery = db.collection("customers");
if (ONLY_CLIENT) customerQuery = customerQuery.where("clientId", "==", ONLY_CLIENT);
const all = (await customerQuery.get()).docs;
const groups = new Map();
const invalid = [];

for (const snapshot of all) {
  const data = snapshot.data();
  if (data.status === "merged") continue;
  const phone = normalizeIndianPhone(data.normalizedPhone ?? data.phone);
  if (!phone || typeof data.clientId !== "string" || !data.clientId) {
    invalid.push({ uid: snapshot.id, clientId: data.clientId ?? null, phone: data.phone ?? null });
    continue;
  }
  if (ONLY_PHONE && phone !== ONLY_PHONE) continue;
  const key = `${data.clientId}|${phone}`;
  const group = groups.get(key) ?? { clientId: data.clientId, phone, members: [] };
  group.members.push({ uid: snapshot.id, data });
  groups.set(key, group);
}

const report = {
  project: PROJECT,
  mode: INDEX_ONLY ? `index-only-${APPLY ? "apply" : "dry-run"}` : MERGE_GROUP ? "confirmed-merge" : APPLY ? "apply" : "dry-run",
  scannedCustomers: all.length,
  invalidPhone: invalid,
  duplicateGroups: [],
  indexesBackfilled: [],
  indexConflicts: [],
  orphanTokenCandidates: [],
  mergeResults: [],
  errors: [],
};
const customerByUid = new Map(all.map((snapshot) => [snapshot.id, snapshot.data()]));

for (const group of groups.values()) {
  const key = phoneIndexKey(group.clientId, group.phone);
  if (group.members.length === 1) {
    const member = group.members[0];
    const indexRef = db.doc(`${PHONE_INDEX_COLLECTION}/${key}`);
    const indexSnapshot = await indexRef.get();
    const safeOwner = !indexSnapshot.exists || indexSnapshot.data().customerId === member.uid;
    const needsBackfill = normalizeIndianPhone(member.data.normalizedPhone ?? member.data.phone) !== member.data.normalizedPhone
      || member.data.phoneIndexId !== key
      || !indexSnapshot.exists;
    if (needsBackfill && safeOwner) {
      const finding = { clientId: group.clientId, phoneIndexId: key, customerId: member.uid, indexExists: indexSnapshot.exists, status: APPLY && INDEX_ONLY ? "backfilled" : "planned" };
      report.indexesBackfilled.push(finding);
      if (APPLY && INDEX_ONLY) {
        const batch = db.batch();
        if (member.data.normalizedPhone !== group.phone || member.data.phone !== group.phone) {
          batch.update(db.doc(`customers/${member.uid}`), {
            normalizedPhone: group.phone,
            phone: group.phone,
            phoneIndexId: key,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        if (!indexSnapshot.exists) {
          batch.create(indexRef, {
            phone: group.phone,
            clientId: group.clientId,
            customerId: member.uid,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        await batch.commit();
      }
    } else if (needsBackfill && !safeOwner) {
      report.indexConflicts.push({ clientId: group.clientId, phoneIndexId: key, candidateCustomerId: member.uid, currentOwner: indexSnapshot.data().customerId ?? null });
    }
    continue;
  }

  try {
    const inspected = await inspectGroup(group);
    const entry = summarizeGroup(group, inspected);
    entry.confirmedByExplicitPhoneKey = MERGE_GROUP === inspected.key || CONFIRMED_GROUPS.includes(inspected.key);
    entry.status = inspected.indexOwner && !inspected.members.some((member) => member.uid === inspected.indexOwner)
      ? "index-conflict (no changes)"
      : entry.confirmedByExplicitPhoneKey
        ? "explicitly-confirmed"
        : "candidate-only (review required)";
    report.duplicateGroups.push(entry);

    if (INDEX_ONLY && APPLY && CONFIRMED_GROUPS.includes(inspected.key) && !inspected.indexExists && !entry.phoneIndex.conflict) {
      await db.doc(`${PHONE_INDEX_COLLECTION}/${inspected.key}`).create({
        phone: group.phone,
        clientId: group.clientId,
        customerId: entry.canonical,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      entry.status = "index-created; duplicate customer records left untouched";
    }

    if (MERGE_GROUP === inspected.key && APPLY) {
      const merged = await mergeConfirmedGroup(group, inspected);
      report.mergeResults.push({ clientId: group.clientId, phoneIndexId: inspected.key, ...merged });
      entry.status = "merged; records archived and history preserved; no deletions";
    }
  } catch (error) {
    report.errors.push({ group: key, error: String(error?.message ?? error) });
  }
}

// Read-only orphan-token audit. Candidates are reported only; the script never deletes tokens.
let tokenQuery = db.collection("customerTokens");
if (ONLY_CLIENT) tokenQuery = tokenQuery.where("clientId", "==", ONLY_CLIENT);
for (const tokenSnapshot of (await tokenQuery.get()).docs) {
  const token = tokenSnapshot.data();
  const customerId = text(token.customerId);
  const clientId = text(token.clientId);
  if (!customerId || !clientId) {
    report.orphanTokenCandidates.push({ tokenId: tokenSnapshot.id, reason: "missing-customer-or-client-reference" });
    continue;
  }
  let customer = customerByUid.get(customerId);
  if (!customer) {
    const customerSnapshot = await db.doc(`customers/${customerId}`).get();
    customer = customerSnapshot.exists ? customerSnapshot.data() : null;
  }
  if (!customer) {
    report.orphanTokenCandidates.push({ tokenId: tokenSnapshot.id, customerId, clientId, reason: "customer-document-missing" });
  } else if (customer.clientId !== clientId) {
    report.orphanTokenCandidates.push({ tokenId: tokenSnapshot.id, customerId, clientId, customerClientId: customer.clientId ?? null, reason: "client-mismatch" });
  } else if (customer.status === "merged" && customer.mergedInto) {
    report.orphanTokenCandidates.push({ tokenId: tokenSnapshot.id, customerId, clientId, mergedInto: customer.mergedInto, reason: "token-still-points-to-merged-customer" });
  }
}

if (MERGE_GROUP && !report.duplicateGroups.some((group) => group.phoneIndexId === MERGE_GROUP)) {
  report.errors.push({ group: MERGE_GROUP, error: "Confirmed phoneIndexId did not match a duplicate group in the current scan." });
}

if (JSON_OUTPUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  log(`Mode: ${report.mode} · customers scanned: ${report.scannedCustomers}`);
  log(`Duplicate candidate groups: ${report.duplicateGroups.length} · index backfills: ${report.indexesBackfilled.length} · index conflicts: ${report.indexConflicts.length} · orphan token candidates: ${report.orphanTokenCandidates.length} · invalid phones: ${report.invalidPhone.length} · errors: ${report.errors.length}`);
  for (const group of report.duplicateGroups) {
    const ids = group.duplicateCandidates.map((member) => member.uid).join(", ");
    log(`  ${group.clientId} ${group.normalizedPhone} → keep ${group.canonical}, candidates ${ids} [${group.status}]`);
  }
  if (!APPLY) log("DRY RUN — nothing was written. Review customer code, UID, creation time, loyalty, transaction, reward, QR-token, and phone-index signals before any confirmed merge.");
  if (DELETE) log("Deletion is disabled; historical data and archived duplicate profiles are retained.");
}

process.exit(report.errors.length ? 1 : 0);
