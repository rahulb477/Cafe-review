#!/usr/bin/env node
/**
 * Merge duplicate customers (same business + same normalized phone) — SAFE BY DEFAULT.
 *
 *   node scripts/dedupe-customers.mjs                      # DRY RUN: report only, writes nothing
 *   node scripts/dedupe-customers.mjs --apply              # merge + soft-mark duplicates (no deletes)
 *   node scripts/dedupe-customers.mjs --apply --delete     # …and delete duplicates AFTER verification
 *   node scripts/dedupe-customers.mjs --index-only [--apply]
 *       # NON-DESTRUCTIVE: only creates missing customerPhoneIndex entries so existing
 *       # numbers (incl. legacy duplicates) are protected. Duplicate customers are NOT
 *       # modified or merged (entry → canonical candidate). Single legacy customers get
 *       # normalizedPhone + phoneIndexId backfilled.
 *   options: --client <clientId>   --phone <any format>   --json
 *
 * Credentials (Admin SDK, bypasses rules — run from a trusted machine only):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/service-account.json   or
 *   FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",…}'
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 for local testing.
 *
 * For each group of customers/{uid} with the same clientId + normalized phone:
 *   1. Canonical = valid profile → has loyalty account → earliest valid createdAt
 *      → most stamps → most visits → uid.
 *   2. Archive every duplicate (customer + loyalty) to customerMergeArchive/{dupUid}.
 *   3. One transaction: canonical gets summed stamps & visits, max lastVisitAt,
 *      earliest createdAt, normalizedPhone, mergedCustomerIds; duplicates are
 *      soft-marked { status:"merged", mergedInto } and their loyalty stamps moved
 *      (stampsBeforeMerge kept); customerPhoneIndex/{key} → canonical.
 *   4. Re-point history (customerId) to the canonical UID: stampTransactions,
 *      rewardRedemptions, customerTokens (old QR codes keep working),
 *      clients/{clientId}/reviews. Original id kept in originalCustomerId.
 *   5. Verify (totals, no leftover references, archive present, index correct).
 *      Only with --delete AND successful verification are duplicate docs deleted
 *      (their archive copy is kept).
 * Re-runnable: already-merged duplicates are finished (re-point/verify/delete), not re-summed.
 */
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { normalizeIndianPhone, phoneIndexKey, PHONE_INDEX_COLLECTION } from "../src/shared/phone.ts";

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const APPLY = flag("apply");
const DELETE = flag("delete");
const INDEX_ONLY = flag("index-only");
if (INDEX_ONLY && DELETE) throw new Error("--index-only cannot be combined with --delete");
const ONLY_CLIENT = opt("client");
const ONLY_PHONE = opt("phone") ? normalizeIndianPhone(opt("phone")) : null;
const PROJECT = opt("project") ?? "cafe-review7";
if (DELETE && !APPLY) throw new Error("--delete requires --apply");
if (PROJECT !== "cafe-review7" && !process.env.FIRESTORE_EMULATOR_HOST) throw new Error(`Refusing to run against project "${PROJECT}"`);

const credential = process.env.FIRESTORE_EMULATOR_HOST
  ? undefined
  : process.env.FIREBASE_SERVICE_ACCOUNT
    ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    : applicationDefault();
initializeApp({ projectId: PROJECT, ...(credential ? { credential } : {}) });
const db = getFirestore();

const HISTORY = ["stampTransactions", "rewardRedemptions", "customerTokens"];
const log = (...a) => !flag("json") && console.log(...a);

function millis(v) {
  if (!v) return null;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (v instanceof Date) return isNaN(v) ? null : v.getTime();
  if (typeof v === "number" && v > 0) return v < 1e11 ? v * 1000 : v;
  if (typeof v === "object" && typeof (v.seconds ?? v._seconds) === "number") return (v.seconds ?? v._seconds) * 1000;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return isNaN(t) ? null : t;
  }
  return null;
}
const count = (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const validProfile = (d) => typeof d.name === "string" && d.name.trim().length >= 2 && !!normalizeIndianPhone(d.normalizedPhone ?? d.phone);

async function historyRefs(clientId, uid) {
  const out = [];
  for (const c of HISTORY) out.push(...(await db.collection(c).where("customerId", "==", uid).get()).docs);
  out.push(...(await db.collection(`clients/${clientId}/reviews`).where("customerId", "==", uid).get()).docs);
  return out;
}

async function repoint(clientId, fromUid, toUid) {
  const refs = await historyRefs(clientId, fromUid);
  for (let i = 0; i < refs.length; i += 400) {
    const batch = db.batch();
    for (const d of refs.slice(i, i + 400)) batch.update(d.ref, { customerId: toUid, originalCustomerId: fromUid });
    await batch.commit();
  }
  return refs.length;
}

// ── 1. Load & group ─────────────────────────────────────────────────────────
let q = db.collection("customers");
if (ONLY_CLIENT) q = q.where("clientId", "==", ONLY_CLIENT);
const all = (await q.get()).docs;
const groups = new Map();
const invalid = [];
const leftovers = []; // soft-merged earlier but not yet finished
for (const snap of all) {
  const d = snap.data();
  if (d.status === "merged") {
    if (typeof d.mergedInto === "string") leftovers.push({ uid: snap.id, data: d });
    continue;
  }
  const phone = normalizeIndianPhone(d.normalizedPhone ?? d.phone);
  if (!phone || typeof d.clientId !== "string" || !d.clientId) {
    invalid.push({ uid: snap.id, clientId: d.clientId ?? null, phone: d.phone ?? null });
    continue;
  }
  if (ONLY_PHONE && phone !== ONLY_PHONE) continue;
  const key = `${d.clientId}|${phone}`;
  if (!groups.has(key)) groups.set(key, { clientId: d.clientId, phone, members: [] });
  groups.get(key).members.push({ uid: snap.id, data: d });
}

const report = { mode: (INDEX_ONLY ? "index-only:" : "") + (APPLY ? (DELETE ? "apply+delete" : "apply") : "dry-run"), indexCreated: [], scanned: all.length, duplicateGroups: [], backfilled: [], invalidPhone: invalid, errors: [] };

// ── 2. Process groups ───────────────────────────────────────────────────────
for (const g of groups.values()) {
  const key = phoneIndexKey(g.clientId, g.phone);
  for (const m of g.members) {
    const l = await db.doc(`loyaltyAccounts/${m.uid}`).get();
    m.loyalty = l.exists ? l.data() : null;
    m.loyaltyCounts = !!m.loyalty && (!m.loyalty.clientId || m.loyalty.clientId === g.clientId) && m.loyalty.status !== "merged";
  }

  if (g.members.length === 1) {
    // Single customer: backfill normalizedPhone + index (never steal an index owned by someone else).
    const m = g.members[0];
    const idx = await db.doc(`${PHONE_INDEX_COLLECTION}/${key}`).get();
    const needs = m.data.normalizedPhone !== g.phone || !idx.exists;
    if (needs && (!idx.exists || idx.data().customerId === m.uid)) {
      report.backfilled.push({ uid: m.uid, key });
      if (APPLY) {
        const batch = db.batch();
        batch.update(db.doc(`customers/${m.uid}`), { normalizedPhone: g.phone, phone: g.phone, phoneIndexId: key, updatedAt: FieldValue.serverTimestamp() });
        if (!idx.exists)
          batch.set(db.doc(`${PHONE_INDEX_COLLECTION}/${key}`), { phone: g.phone, clientId: g.clientId, customerId: m.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
        await batch.commit();
      }
    }
    continue;
  }

  const ranked = [...g.members].sort(
    (a, b) =>
      Number(validProfile(b.data)) - Number(validProfile(a.data)) ||
      Number(b.loyaltyCounts) - Number(a.loyaltyCounts) ||
      (millis(a.data.createdAt) ?? Infinity) - (millis(b.data.createdAt) ?? Infinity) ||
      count(b.loyalty?.stamps) - count(a.loyalty?.stamps) ||
      count(b.data.totalVisits) - count(a.data.totalVisits) ||
      a.uid.localeCompare(b.uid)
  );
  const canonical = ranked[0];
  const dups = ranked.slice(1);

  if (INDEX_ONLY) {
    // Protect the number without touching any duplicate customer document.
    const idx = await db.doc(`${PHONE_INDEX_COLLECTION}/${key}`).get();
    if (!idx.exists) {
      report.indexCreated.push({ key, customerId: canonical.uid, duplicatesLeftUntouched: dups.map((d) => d.uid) });
      if (APPLY)
        await db.doc(`${PHONE_INDEX_COLLECTION}/${key}`).create({ phone: g.phone, clientId: g.clientId, customerId: canonical.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    }
    report.duplicateGroups.push({ clientId: g.clientId, phone: g.phone, canonical: canonical.uid, duplicates: dups.map((d) => ({ uid: d.uid })), status: "reported (index-only, not merged)" });
    continue;
  }
  const expected = {
    stamps: g.members.reduce((s, m) => s + (m.loyaltyCounts ? count(m.loyalty.stamps) : 0), 0),
    totalVisits: g.members.reduce((s, m) => s + count(m.data.totalVisits), 0),
    lastVisitAt: Math.max(0, ...g.members.map((m) => millis(m.data.lastVisitAt) ?? 0)) || null,
    createdAt: Math.min(Infinity, ...g.members.map((m) => millis(m.data.createdAt) ?? Infinity)),
  };
  if (expected.createdAt === Infinity) expected.createdAt = null;
  const entry = {
    clientId: g.clientId,
    phone: g.phone,
    canonical: canonical.uid,
    duplicates: dups.map((d) => ({ uid: d.uid, name: d.data.name ?? null, stamps: d.loyaltyCounts ? count(d.loyalty.stamps) : 0, totalVisits: count(d.data.totalVisits) })),
    merged: { stamps: expected.stamps, totalVisits: expected.totalVisits, lastVisitAt: expected.lastVisitAt ? new Date(expected.lastVisitAt).toISOString() : null, createdAt: expected.createdAt ? new Date(expected.createdAt).toISOString() : null },
    status: APPLY ? "pending" : "planned",
  };
  report.duplicateGroups.push(entry);
  if (!APPLY) continue;

  try {
    // 2a. Archive first (pure copy; nothing removed).
    for (const d of dups)
      await db.doc(`customerMergeArchive/${d.uid}`).set({ customer: d.data, loyalty: d.loyalty, mergedInto: canonical.uid, clientId: g.clientId, normalizedPhone: g.phone, archivedAt: FieldValue.serverTimestamp() });

    // 2b. Atomic merge (re-reads fresh loyalty so concurrent staff stamps aren't lost).
    await db.runTransaction(async (tx) => {
      const cRef = db.doc(`customers/${canonical.uid}`);
      const clRef = db.doc(`loyaltyAccounts/${canonical.uid}`);
      const cl = await tx.get(clRef);
      const dl = await Promise.all(dups.map((d) => tx.get(db.doc(`loyaltyAccounts/${d.uid}`))));
      const fresh = (s) => (s.exists && (!s.data().clientId || s.data().clientId === g.clientId) && s.data().status !== "merged" ? count(s.data().stamps) : 0);
      const stamps = fresh(cl) + dl.reduce((s, x) => s + fresh(x), 0);
      expected.stamps = stamps;

      tx.update(cRef, {
        normalizedPhone: g.phone,
        phone: g.phone,
        phoneIndexId: key,
        totalVisits: expected.totalVisits,
        ...(expected.lastVisitAt ? { lastVisitAt: Timestamp.fromMillis(expected.lastVisitAt) } : {}),
        ...(expected.createdAt ? { createdAt: Timestamp.fromMillis(expected.createdAt) } : {}),
        mergedCustomerIds: FieldValue.arrayUnion(...dups.map((d) => d.uid)),
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (cl.exists || stamps > 0)
        tx.set(clRef, { clientId: g.clientId, customerId: canonical.uid, stamps, mergedStampsFrom: FieldValue.arrayUnion(...dups.map((d) => d.uid)), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      dups.forEach((d, i) => {
        tx.update(db.doc(`customers/${d.uid}`), { status: "merged", mergedInto: canonical.uid, mergedAt: FieldValue.serverTimestamp() });
        if (dl[i].exists) tx.update(dl[i].ref, { stamps: 0, stampsBeforeMerge: count(dl[i].data().stamps), status: "merged", mergedInto: canonical.uid });
      });
      tx.set(db.doc(`${PHONE_INDEX_COLLECTION}/${key}`), { phone: g.phone, clientId: g.clientId, customerId: canonical.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    });
    entry.status = "merged";
    for (const d of dups) leftovers.push({ uid: d.uid, data: { clientId: g.clientId, mergedInto: canonical.uid, normalizedPhone: g.phone }, expected, key });
  } catch (e) {
    entry.status = "error";
    report.errors.push({ group: `${g.clientId}|${g.phone}`, error: String(e?.message ?? e) });
  }
}

// ── 3. Re-point history, verify, optionally delete ──────────────────────────
report.finished = [];
if (APPLY && !INDEX_ONLY) {
  for (const l of leftovers) {
    const { uid } = l;
    const clientId = l.data.clientId;
    const into = l.data.mergedInto;
    const repointed = await repoint(clientId, uid, into);
    const [left, archive, canonCustomer, canonLoyalty] = await Promise.all([
      historyRefs(clientId, uid),
      db.doc(`customerMergeArchive/${uid}`).get(),
      db.doc(`customers/${into}`).get(),
      db.doc(`loyaltyAccounts/${into}`).get(),
    ]);
    const phone = normalizeIndianPhone(l.data.normalizedPhone ?? l.data.phone);
    const idx = phone ? await db.doc(`${PHONE_INDEX_COLLECTION}/${phoneIndexKey(clientId, phone)}`).get() : null;
    const checks = {
      noLeftoverReferences: left.length === 0,
      archiveExists: archive.exists,
      canonicalExists: canonCustomer.exists,
      indexPointsToCanonical: !!idx?.exists && idx.data().customerId === into,
      ...(l.expected
        ? {
            stampsPreserved: count(canonLoyalty.data()?.stamps) >= l.expected.stamps,
            visitsPreserved: count(canonCustomer.data()?.totalVisits) >= l.expected.totalVisits,
          }
        : {}),
    };
    const verified = Object.values(checks).every(Boolean);
    let deleted = false;
    if (DELETE && verified) {
      const batch = db.batch();
      batch.delete(db.doc(`customers/${uid}`));
      batch.delete(db.doc(`loyaltyAccounts/${uid}`));
      await batch.commit();
      deleted = true;
    }
    report.finished.push({ duplicate: uid, mergedInto: into, repointed, verified, checks, deleted });
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
if (flag("json")) console.log(JSON.stringify(report, null, 2));
else {
  log(`Mode: ${report.mode} · customers scanned: ${report.scanned}`);
  log(`Duplicate groups: ${report.duplicateGroups.length}`);
  for (const gr of report.duplicateGroups)
    log(
      gr.merged
        ? `  ${gr.clientId} ${gr.phone} → keep ${gr.canonical}, merge ${gr.duplicates.map((d) => d.uid).join(", ")} | stamps ${gr.merged.stamps}, visits ${gr.merged.totalVisits} [${gr.status}]`
        : `  ${gr.clientId} ${gr.phone} → index → ${gr.canonical}; duplicates left untouched: ${gr.duplicates.map((d) => d.uid).join(", ")} [${gr.status}]`
    );
  log(`Index backfills: ${report.backfilled.length} · index entries for duplicate groups: ${report.indexCreated.length} · invalid phones: ${report.invalidPhone.length} · errors: ${report.errors.length}`);
  for (const f of report.finished) log(`  ${f.duplicate} → ${f.mergedInto}: repointed ${f.repointed}, verified ${f.verified}, deleted ${f.deleted}`, f.verified ? "" : JSON.stringify(f.checks));
  if (!APPLY) log(`\nDRY RUN — nothing was written. Re-run with ${INDEX_ONLY ? "--index-only --apply" : "--apply (and later --delete)"}.`);
}
process.exit(report.errors.length ? 1 : 0);
