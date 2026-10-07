#!/usr/bin/env node
/**
 * Safe, non-destructive loyalty reconciliation for cafe-review7.
 *
 *   node scripts/reconcile-loyalty.mjs --dry-run
 *   node scripts/reconcile-loyalty.mjs --dry-run --client <clientId>
 *   node scripts/reconcile-loyalty.mjs --apply --client <clientId>
 *
 * Dry-run is the default. --apply is the only write mode. It never creates
 * accounts, reduces balances/counters, changes current stamps based on history,
 * deletes data, or rewrites transaction history. It only copies a valid legacy
 * `stamps` balance to missing `currentStamps` and reconciles lifetime/redeemed
 * counters upward using valid history.
 *
 * Uses Firebase Admin SDK credentials on a trusted operator machine:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   or FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",…}'
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 for emulator tests.
 */
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
};
const APPLY = flag("apply");
const PROJECT = option("project") ?? "cafe-review7";
const ONLY_CLIENT = option("client");
const ONLY_CUSTOMER = option("customer");
const JSON_OUTPUT = flag("json");

if (flag("help")) {
  console.log("Usage: node scripts/reconcile-loyalty.mjs [--dry-run] [--apply] [--client <clientId>] [--customer <customerId>] [--json]");
  process.exit(0);
}
if (PROJECT !== "cafe-review7" && !process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error(`Refusing to run against project \"${PROJECT}\"`);
}
if (APPLY && flag("dry-run")) throw new Error("Choose either --dry-run or --apply, not both");
if (ONLY_CLIENT && !/^[\w-]{1,128}$/.test(ONLY_CLIENT)) throw new Error("Invalid --client value");

const credential = process.env.FIRESTORE_EMULATOR_HOST
  ? undefined
  : process.env.FIREBASE_SERVICE_ACCOUNT
    ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    : applicationDefault();
initializeApp({ projectId: PROJECT, ...(credential ? { credential } : {}) });
const db = getFirestore();

function object(value) {
  return value && typeof value === "object" ? value : {};
}

function count(value) {
  if (typeof value === "string" && value.trim() === "") return null;
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
}

function dateMillis(value) {
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
    const v = object(value);
    const seconds = typeof v.seconds === "number" ? v.seconds : typeof v._seconds === "number" ? v._seconds : null;
    const nanos = typeof v.nanoseconds === "number" ? v.nanoseconds : typeof v._nanoseconds === "number" ? v._nanoseconds : 0;
    if (seconds === null || !Number.isInteger(seconds) || !Number.isInteger(nanos) || nanos < 0 || nanos >= 1_000_000_000) return null;
    const ms = seconds * 1000 + nanos / 1_000_000;
    return Number.isFinite(ms) && Number.isFinite(new Date(ms).getTime()) ? ms : null;
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return null;
    if (/^-?\d+(?:\.\d+)?$/.test(text)) {
      const number = Number(text);
      const ms = Math.abs(number) < 100_000_000_000 ? number * 1000 : number;
      return Number.isFinite(ms) && Number.isFinite(new Date(ms).getTime()) ? ms : null;
    }
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function statusText(data) {
  return [data.status, data.state, data.result]
    .filter((value) => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

function isInvalidHistory(data) {
  if (data.success === false || data.succeeded === false || data.isSuccessful === false) return true;
  if (data.voided === true || data.reversed === true || data.isReversed === true || data.deleted === true) return true;
  if (/(failed|failure|cancelled|canceled|reversed|voided|rejected|pending|error)/.test(statusText(data))) return true;
  const type = [data.type, data.transactionType, data.action].filter((value) => typeof value === "string").join(" ").toLowerCase();
  return /(redeem|redemption|remove|deduct|debit|refund|reversal|void|cancel)/.test(type);
}

function stampAmount(data) {
  for (const key of ["stampsAwarded", "stampAmount", "amount", "stampDelta", "delta"]) {
    if (!(key in data)) continue;
    const raw = data[key];
    if (typeof raw === "string" && raw.trim() === "") return 0;
    const value = typeof raw === "string" ? Number(raw) : raw;
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }
  return 1;
}

async function historyFor(collectionPath, customerId) {
  return (await db.collection(collectionPath).where("customerId", "==", customerId).get()).docs;
}

function summarizeStampRows(rows, clientId, customerId) {
  const seen = new Set();
  let awarded = 0;
  let visits = 0;
  let latest = null;
  for (const snapshot of rows) {
    if (seen.has(snapshot.id)) continue;
    seen.add(snapshot.id);
    const data = snapshot.data();
    if (data.customerId !== customerId || (data.clientId && data.clientId !== clientId) || isInvalidHistory(data)) continue;
    const amount = stampAmount(data);
    if (amount <= 0) continue;
    awarded += amount;
    if (data.visitCounted === true) visits += 1;
    const ms = dateMillis(data.createdAt ?? data.timestamp ?? data.transactionAt);
    if (ms !== null && (latest === null || ms > latest)) latest = ms;
  }
  return { awarded, visits, latest };
}

function successfulRedemptions(rows, clientId, customerId) {
  return rows.filter((snapshot) => {
    const data = snapshot.data();
    return data.customerId === customerId
      && (!data.clientId || data.clientId === clientId)
      && data.success !== false
      && data.reversed !== true
      && data.voided !== true
      && data.cancelled !== true
      && !/(failed|failure|cancel|reverse|void|reject|error|pending)/.test(statusText(data));
  }).length;
}

const report = {
  project: PROJECT,
  mode: APPLY ? "apply" : "dry-run",
  scannedCustomers: 0,
  checkedAccounts: 0,
  updated: [],
  unchanged: [],
  skipped: [],
  errors: [],
};

let customerQuery = db.collection("customers");
if (ONLY_CLIENT) customerQuery = customerQuery.where("clientId", "==", ONLY_CLIENT);
if (ONLY_CUSTOMER) customerQuery = customerQuery.where("uid", "==", ONLY_CUSTOMER);
const customerSnapshots = await customerQuery.get();
report.scannedCustomers = customerSnapshots.size;

for (const customerSnapshot of customerSnapshots.docs) {
  const customerId = customerSnapshot.id;
  const customer = customerSnapshot.data();
  const clientId = typeof customer.clientId === "string" ? customer.clientId : "";
  if (!clientId || (ONLY_CLIENT && clientId !== ONLY_CLIENT)) {
    report.skipped.push({ customerId, reason: "missing-or-mismatched-clientId" });
    continue;
  }
  if (customer.status === "merged") {
    report.skipped.push({ customerId, reason: "merged-customer" });
    continue;
  }

  try {
    const loyaltyRef = db.doc(`loyaltyAccounts/${customerId}`);
    const [loyaltySnapshot, stampSnapshots, redemptionSnapshots] = await Promise.all([
      loyaltyRef.get(),
      historyFor(`clients/${clientId}/stampTransactions`, customerId),
      historyFor(`clients/${clientId}/rewardRedemptions`, customerId),
    ]);
    if (!loyaltySnapshot.exists) {
      report.skipped.push({ customerId, clientId, reason: "loyalty-account-missing; no account auto-created" });
      continue;
    }

    report.checkedAccounts += 1;
    const loyalty = object(loyaltySnapshot.data());
    if (loyalty.clientId && loyalty.clientId !== clientId) {
      report.skipped.push({ customerId, clientId, reason: "loyalty-account-client-mismatch" });
      continue;
    }
    if (loyalty.status === "merged") {
      report.skipped.push({ customerId, clientId, reason: "merged-loyalty-account" });
      continue;
    }

    const stamps = summarizeStampRows(stampSnapshots.docs, clientId, customerId);
    const historyRedeemed = successfulRedemptions(redemptionSnapshots.docs, clientId, customerId);
    const currentStamps = count(loyalty.currentStamps) ?? count(loyalty.stamps);
    const currentLifetime = count(loyalty.lifetimeStamps);
    const derivedLifetime = Math.max(currentStamps ?? 0, currentLifetime ?? 0, stamps.awarded);
    const currentRedeemed = count(loyalty.rewardsRedeemed);
    const derivedRedeemed = Math.max(currentRedeemed ?? 0, historyRedeemed);
    const storedLastStamp = dateMillis(loyalty.lastStampAt);
    const derivedLastStamp = storedLastStamp === null
      ? stamps.latest
      : stamps.latest === null ? storedLastStamp : Math.max(storedLastStamp, stamps.latest);

    const patch = {};
    if (count(loyalty.currentStamps) === null && currentStamps !== null) patch.currentStamps = currentStamps;
    if ((currentLifetime === null && (currentStamps !== null || stamps.awarded > 0)) || (currentLifetime !== null && derivedLifetime > currentLifetime)) {
      patch.lifetimeStamps = derivedLifetime;
    }
    if (currentRedeemed === null && historyRedeemed > 0 || currentRedeemed !== null && derivedRedeemed > currentRedeemed) {
      patch.rewardsRedeemed = derivedRedeemed;
    }
    if (storedLastStamp === null && derivedLastStamp !== null) {
      // Fill a missing/invalid timestamp from the latest valid historical stamp.
      patch.lastStampAt = new Date(derivedLastStamp);
    } else if (storedLastStamp !== null && stamps.latest !== null && stamps.latest > storedLastStamp) {
      // Only move this high-water mark forward.
      patch.lastStampAt = new Date(stamps.latest);
    }

    const finding = {
      customerId,
      clientId,
      currentStamps: currentStamps ?? null,
      lifetimeStamps: currentLifetime ?? null,
      historicalStamps: stamps.awarded,
      proposedLifetimeStamps: derivedLifetime,
      rewardsRedeemed: currentRedeemed ?? null,
      historicalRedemptions: historyRedeemed,
      proposedRewardsRedeemed: derivedRedeemed,
      historicalVisits: stamps.visits,
      lastStampAt: storedLastStamp === null ? null : new Date(storedLastStamp).toISOString(),
      proposedLastStampAt: derivedLastStamp === null ? null : new Date(derivedLastStamp).toISOString(),
      fieldsToUpdate: Object.keys(patch),
    };

    if (!Object.keys(patch).length) {
      report.unchanged.push(finding);
      continue;
    }

    report.updated.push(finding);
    if (APPLY) {
      patch.updatedAt = FieldValue.serverTimestamp();
      await loyaltyRef.update(patch);
    }
  } catch (error) {
    report.errors.push({ customerId, clientId, error: String(error?.message ?? error) });
  }
}

if (JSON_OUTPUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Mode: ${report.mode} · customers: ${report.scannedCustomers} · loyalty accounts checked: ${report.checkedAccounts}`);
  console.log(`Changes: ${report.updated.length} · unchanged: ${report.unchanged.length} · skipped: ${report.skipped.length} · errors: ${report.errors.length}`);
  for (const row of report.updated) console.log(`  ${row.clientId}/${row.customerId}: ${row.fieldsToUpdate.join(", ")} | lifetime ${row.lifetimeStamps ?? "—"} → ${row.proposedLifetimeStamps}`);
  for (const row of report.skipped) console.log(`  skip ${row.customerId}: ${row.reason}`);
  if (!APPLY) console.log("DRY RUN — no Firestore documents were changed. Review the report before running with --apply.");
}

process.exit(report.errors.length ? 1 : 0);
