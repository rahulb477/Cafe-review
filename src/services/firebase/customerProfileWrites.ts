/**
 * customers/{uid} registration + profile writes with PER-BUSINESS PHONE UNIQUENESS.
 * Alias-free (relative imports only) so the exact same code runs in the app and
 * in the Firestore-emulator test suite.
 *
 * Production document paths (exact):
 *   customers/{uid}
 *     { uid, clientId, name, phone, normalizedPhone, phoneIndexId, email,
 *       totalVisits, lastVisitAt, status, createdAt, updatedAt, qrToken }
 *   customerPhoneIndex/{phoneIndexId}          phoneIndexId = `${clientId}_${digits}`
 *     { phone, clientId, customerId, createdAt, updatedAt }
 *   customerTokens/{token}
 *     { customerId, clientId, createdAt }        (clientId → staff can resolve only their business's QR)
 *
 * Uniqueness: ONE Firestore transaction writes the customer doc, its phone-index
 * entry and the QR token. Security Rules make index entries create-only and bind
 * the customer doc to owning its entry (verified with plain concatenation:
 * clientId + '_' + normalizedPhone[1:]). If the number is already registered for
 * the business, Firestore rejects the whole commit → nothing is written.
 */
import { doc, getDoc, runTransaction, serverTimestamp, updateDoc, writeBatch, type Firestore } from "firebase/firestore";
import { PHONE_INDEX_COLLECTION, normalizeIndianPhone, phoneIndexId } from "../../shared/phone";

export interface ProfileInput {
  name: string;
  /** Any accepted Indian format; normalized here. */
  phone: string;
  /** undefined = leave unchanged; null = no email. */
  email?: string | null;
}

export type ProfileSaveResult =
  | { status: "created" | "updated"; customerId: string; qrToken: string | null }
  /** Number belongs to another customer of this business. No foreign data is exposed. */
  | { status: "PHONE_ALREADY_REGISTERED"; clientId: string }
  /** Network / Firestore outage — genuinely temporary. */
  | { status: "TEMPORARILY_UNAVAILABLE"; code: string };

// ── Safe diagnostics ────────────────────────────────────────────────────────
export interface RegistrationDiag {
  operation: string;
  clientId: string;
  normalizedPhone: string;
  indexPath: string;
  code?: string;
  message?: string;
}
type DiagLogger = (event: RegistrationDiag) => void;

const maskPhone = (p: string) => p.replace(/^(\+?\d{4})\d+(\d{4})$/, "$1****$2");
const maskPath = (path: string) => path.replace(/(\d{4})\d+(\d{4})$/, "$1****$2");
/** Default: masked phone (no names, no tokens). Set a verbose logger in diagnostic mode. */
let diagLogger: DiagLogger = (e) =>
  console[e.code ? "warn" : "info"](
    `[diag] registration ${e.operation} · clientId=${e.clientId} · phone=${maskPhone(e.normalizedPhone)} · ${maskPath(e.indexPath)}${e.code ? ` · ${e.code} · ${e.message ?? ""}` : ""}`
  );
export function setRegistrationLogger(fn: DiagLogger) {
  diagLogger = fn;
}

const code = (e: unknown) => (e as { code?: string })?.code ?? "";
const msg = (e: unknown) => ((e as { message?: string })?.message ?? String(e)).slice(0, 200);
const TEMPORARY = new Set(["unavailable", "deadline-exceeded", "resource-exhausted", "aborted", "internal", "cancelled"]);

export async function saveCustomerProfile(db: Firestore, uid: string, clientId: string, input: ProfileInput, newToken: string): Promise<ProfileSaveResult> {
  const phone = normalizeIndianPhone(input.phone);
  if (!phone) throw new Error("invalid-phone");
  const indexId = phoneIndexId(clientId, phone);
  const diag = (operation: string, e?: unknown) =>
    diagLogger({ operation, clientId, normalizedPhone: phone, indexPath: `${PHONE_INDEX_COLLECTION}/${indexId}`, ...(e ? { code: code(e) || "unknown", message: msg(e) } : {}) });

  const ref = doc(db, "customers", uid);
  const tokenRef = doc(db, "customerTokens", newToken);
  let existed = false;
  let legacyPhoneMatches = false;

  try {
    const result = await runTransaction(db, async (tx) => {
      // Reading our own doc inside the transaction serialises concurrent tabs of
      // the same UID: a second commit retries and takes the "existing" branch.
      const snap = await tx.get(ref);

      if (!snap.exists()) {
        existed = false;
        tx.set(tokenRef, { customerId: uid, clientId, createdAt: serverTimestamp() });
        tx.set(doc(db, PHONE_INDEX_COLLECTION, indexId), { phone, clientId, customerId: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        tx.set(ref, {
          uid,
          clientId,
          name: input.name,
          phone,
          normalizedPhone: phone,
          phoneIndexId: indexId,
          email: input.email ?? null,
          totalVisits: 0,
          lastVisitAt: null,
          status: "active",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          qrToken: newToken,
        });
        return { status: "created", customerId: uid, qrToken: newToken } as const;
      }

      // Existing customer: never touch totalVisits / lastVisitAt / createdAt / status / clientId.
      existed = true;
      const cur = snap.data();
      const docClient = typeof cur.clientId === "string" && cur.clientId ? cur.clientId : clientId;
      const targetIndexId = phoneIndexId(docClient, phone);
      const curIndexId = typeof cur.phoneIndexId === "string" ? cur.phoneIndexId : null;
      legacyPhoneMatches = normalizeIndianPhone(cur.normalizedPhone ?? cur.phone) === phone;
      const update: Record<string, unknown> = { name: input.name, updatedAt: serverTimestamp() };
      if (input.email !== undefined) update.email = input.email;

      if (curIndexId !== targetIndexId) {
        // Phone change, or first-time index for an older doc: claim new entry and
        // release the old one in the same commit (no orphan, no duplicate).
        tx.set(doc(db, PHONE_INDEX_COLLECTION, targetIndexId), { phone, clientId: docClient, customerId: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        if (curIndexId) tx.delete(doc(db, PHONE_INDEX_COLLECTION, curIndexId));
        Object.assign(update, { phone, normalizedPhone: phone, phoneIndexId: targetIndexId });
      }

      let token = typeof cur.qrToken === "string" ? cur.qrToken : null;
      if (!token) {
        tx.set(tokenRef, { customerId: uid, clientId: docClient, createdAt: serverTimestamp() });
        update.qrToken = newToken;
        token = newToken;
      }
      tx.update(ref, update);
      return { status: "updated", customerId: uid, qrToken: token } as const;
    });
    diag(result.status === "created" ? "create:ok" : "update:ok");
    return result;
  } catch (e) {
    diag(existed ? "update:denied" : "create:denied", e);
    if (TEMPORARY.has(code(e))) return { status: "TEMPORARILY_UNAVAILABLE", code: code(e) };
    if (code(e) !== "permission-denied") throw e;

    // 1) Our own concurrent submission (other tab / double tap / retried request
    //    whose first attempt committed) — reading only our own doc reveals this.
    const own = await getDoc(ref).catch(() => null);
    const mine = own?.exists() ? own.data() : null;
    if (mine && mine.phoneIndexId === indexId) {
      return { status: "updated", customerId: uid, qrToken: typeof mine.qrToken === "string" ? mine.qrToken : null };
    }

    // 2) Older customer whose number is already indexed by an earlier duplicate:
    //    still let them edit their name/email without touching the phone.
    if (existed && legacyPhoneMatches && mine) {
      try {
        await updateDoc(ref, { name: input.name, updatedAt: serverTimestamp(), ...(input.email !== undefined ? { email: input.email } : {}) });
        diag("update:name-only:ok");
        return { status: "updated", customerId: uid, qrToken: typeof mine.qrToken === "string" ? mine.qrToken : null };
      } catch (e2) {
        diag("update:name-only:denied", e2);
      }
    }

    // 3) Inputs are pre-validated, so the denied commit means the index entry
    //    already belongs to another customer of this business.
    return { status: "PHONE_ALREADY_REGISTERED", clientId };
  }
}

/**
 * Gives an existing profile (older docs) a QR token: creates customerTokens/{token}
 * { customerId, clientId } and sets customers/{uid}.qrToken in ONE batch — the rules
 * only accept a token that the customer document points at in the same commit.
 */
export async function attachQrToken(db: Firestore, uid: string, clientId: string, qrToken: string): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(db, "customerTokens", qrToken), { customerId: uid, clientId, createdAt: serverTimestamp() });
  batch.update(doc(db, "customers", uid), { qrToken, updatedAt: serverTimestamp() });
  await batch.commit();
}
