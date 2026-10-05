/**
 * AUTHORITATIVE VISIT TRACKING — for the Staff App (and Admin tools).
 * Framework-agnostic, alias-free: import or copy verbatim.
 *
 * A visit is counted ONLY when staff successfully completes a loyalty/stamp
 * operation for a scanned customer — never from the customer app.
 *
 * Idempotency reuses the EXISTING stamp transaction id:
 *   clients/{clientId}/stampTransactions/{transactionId}.visitCounted === true  → already counted.
 * In ONE Firestore transaction we:
 *   customers/{uid}:  totalVisits = current + 1, lastVisitAt = serverTimestamp(),
 *                     updatedAt = serverTimestamp(), lastVisitTransactionId = transactionId
 *   clients/{clientId}/stampTransactions/{transactionId}: visitCounted = true, visitCountedAt = serverTimestamp()
 * so retries, double taps and network replays of the same operation count once.
 * Security Rules enforce the same (+1 only, linked to an uncounted transaction).
 */
import { doc, runTransaction, serverTimestamp, type DocumentReference, type DocumentSnapshot, type Firestore, type Transaction } from "firebase/firestore";

export const CUSTOMERS_COLLECTION = "customers";
/** Nested under the business: clients/{clientId}/stampTransactions/{transactionId}. */
export const STAMP_TRANSACTIONS_COLLECTION = "stampTransactions";

export interface VisitInput {
  /** Business that owns the stamp transaction. */
  clientId: string;
  customerId: string;
  /** The id of the existing stamp transaction/activity this visit belongs to. */
  transactionId: string;
}

export type VisitResult =
  | { counted: true; totalVisits: number }
  | { counted: false; reason: "already-counted" | "customer-not-found" | "transaction-not-found"; totalVisits: number | null };

export interface PreparedVisit {
  customerRef: DocumentReference;
  txRef: DocumentReference;
  customerSnap: DocumentSnapshot;
  txSnap: DocumentSnapshot;
  transactionId: string;
}

function currentVisits(snap: DocumentSnapshot): number {
  const v = snap.exists() ? snap.get("totalVisits") : undefined;
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0;
}

function assertIds({ clientId, customerId, transactionId }: VisitInput) {
  if (!/^[\w-]{1,128}$/.test(clientId)) throw new Error("invalid clientId");
  if (!/^[\w-]{1,128}$/.test(customerId)) throw new Error("invalid customerId");
  if (!/^[\w-]{1,128}$/.test(transactionId)) throw new Error("invalid transactionId");
}

/** Step 1 (reads). Call inside your own runTransaction BEFORE any writes. */
export async function prepareVisit(tx: Transaction, db: Firestore, input: VisitInput): Promise<PreparedVisit> {
  assertIds(input);
  const customerRef = doc(db, CUSTOMERS_COLLECTION, input.customerId);
  const txRef = doc(db, "clients", input.clientId, STAMP_TRANSACTIONS_COLLECTION, input.transactionId);
  const [customerSnap, txSnap] = await Promise.all([tx.get(customerRef), tx.get(txRef)]);
  return { customerRef, txRef, customerSnap, txSnap, transactionId: input.transactionId };
}

/**
 * Step 2 (writes). `transactionCreatedInThisTx`: pass true when the same
 * Firestore transaction is also creating stampTransactions/{transactionId}.
 */
export function commitVisit(tx: Transaction, p: PreparedVisit, opts: { transactionCreatedInThisTx?: boolean } = {}): VisitResult {
  if (p.txSnap.exists() && p.txSnap.get("visitCounted") === true) {
    return { counted: false, reason: "already-counted", totalVisits: p.customerSnap.exists() ? currentVisits(p.customerSnap) : null };
  }
  if (!p.txSnap.exists() && !opts.transactionCreatedInThisTx) return { counted: false, reason: "transaction-not-found", totalVisits: null };
  if (!p.customerSnap.exists()) return { counted: false, reason: "customer-not-found", totalVisits: null };

  const totalVisits = currentVisits(p.customerSnap) + 1;
  tx.update(p.customerRef, {
    totalVisits,
    lastVisitAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastVisitTransactionId: p.transactionId,
  });
  tx.set(p.txRef, { visitCounted: true, visitCountedAt: serverTimestamp() }, { merge: true });
  return { counted: true, totalVisits };
}

/**
 * Standalone: call right after the stamp transaction succeeded.
 * Safe to retry — the same transactionId never counts twice.
 */
export async function recordStaffVisit(db: Firestore, input: VisitInput): Promise<VisitResult> {
  try {
    return await runTransaction(db, async (tx) => commitVisit(tx, await prepareVisit(tx, db, input)));
  } catch (e) {
    // A concurrent duplicate (double tap / replay) can commit first; Security Rules
    // then reject the loser because the transaction is already counted. Re-check and
    // report it as a normal duplicate instead of an error.
    const code = (e as { code?: string })?.code;
    if (code !== "permission-denied" && code !== "aborted" && code !== "failed-precondition") throw e;
    const recheck = await runTransaction(db, async (tx) => {
      const p = await prepareVisit(tx, db, input);
      return p.txSnap.exists() && p.txSnap.get("visitCounted") === true
        ? ({ counted: false, reason: "already-counted", totalVisits: p.customerSnap.exists() ? currentVisits(p.customerSnap) : null } as VisitResult)
        : null;
    });
    if (recheck) return recheck;
    throw e;
  }
}
