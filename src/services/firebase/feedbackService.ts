"use client";

import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { getDb } from "./firebaseClient";
import { ensureCustomer } from "./authService";

const MIN_MESSAGE_LENGTH = 3;
const MAX_MESSAGE_LENGTH = 2000;
const WRITE_TIMEOUT_MS = 15_000;
const PENDING_STORAGE_PREFIX = "cafe-review:feedback-pending:";

export const FEEDBACK_CONFIRMED_EVENT = "cafe-review:feedback-confirmed";

type FeedbackRating = 1 | 2 | 3 | 4 | 5;

export interface FirebaseFeedback {
  /** Stored byte-for-byte as supplied by the customer; validation never trims it. */
  message: string;
  rating: FeedbackRating | null;
}

export interface PendingFeedbackDraft {
  message: string;
  rating: FeedbackRating | null;
  attempted: boolean;
  confirmed: boolean;
}

interface PendingFeedback extends PendingFeedbackDraft {
  clientId: string;
  documentId: string;
}

type FeedbackErrorKind = "invalid" | "permission" | "network" | "unavailable" | "pending";

export class FeedbackSubmissionError extends Error {
  constructor(
    public readonly kind: FeedbackErrorKind,
    message: string
  ) {
    super(message);
    this.name = "FeedbackSubmissionError";
  }
}

const pendingInMemory = new Map<string, PendingFeedback>();
const inFlightWrites = new Map<string, Promise<void>>();

const messages = {
  invalid: "Please check your feedback and rating, then try again.",
  permission: "We couldn't save your feedback because permission was denied. Please try again later.",
  network: "We couldn't confirm your feedback because the connection is taking too long. Check your connection and try again; duplicate submissions are prevented.",
  authNetwork: "We couldn't connect to Firebase to submit your feedback. Check your connection and try again.",
  unavailable: "Feedback can't be saved right now. Please try again later.",
};

function storageKey(clientId: string): string {
  return `${PENDING_STORAGE_PREFIX}${encodeURIComponent(clientId)}`;
}

function isRating(value: unknown): value is FeedbackRating | null {
  return value === null || (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5);
}

function isPendingFeedback(value: unknown, clientId: string): value is PendingFeedback {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PendingFeedback>;
  return (
    item.clientId === clientId &&
    typeof item.documentId === "string" &&
    /^[A-Za-z0-9_-]{1,128}$/.test(item.documentId) &&
    typeof item.message === "string" &&
    item.message.length <= MAX_MESSAGE_LENGTH &&
    isRating(item.rating) &&
    typeof item.attempted === "boolean" &&
    typeof item.confirmed === "boolean"
  );
}

function readPending(clientId: string): PendingFeedback | null {
  const memoryValue = pendingInMemory.get(clientId);
  if (memoryValue) return memoryValue;
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(storageKey(clientId));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!isPendingFeedback(value, clientId)) {
      window.sessionStorage.removeItem(storageKey(clientId));
      return null;
    }
    pendingInMemory.set(clientId, value);
    return value;
  } catch {
    // Private browsing modes may disable sessionStorage. The in-memory copy
    // still protects retries and component remounts in the current page session.
    return null;
  }
}

function savePending(pending: PendingFeedback): void {
  pendingInMemory.set(pending.clientId, pending);
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey(pending.clientId), JSON.stringify(pending));
  } catch {
    // Keep the in-memory intent if persistent browser storage is unavailable.
  }
}

export function getPendingFeedback(clientId: string): PendingFeedbackDraft | null {
  const pending = readPending(clientId);
  if (!pending) return null;
  return {
    message: pending.message,
    rating: pending.rating,
    attempted: pending.attempted,
    confirmed: pending.confirmed,
  };
}

export function clearPendingFeedback(clientId: string): void {
  pendingInMemory.delete(clientId);
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(storageKey(clientId));
  } catch {
    // Nothing else is required if browser storage is unavailable.
  }
}

function validateFeedback(feedback: FirebaseFeedback): FirebaseFeedback {
  if (!feedback || typeof feedback.message !== "string") {
    throw new FeedbackSubmissionError("invalid", "Please enter your feedback before submitting.");
  }
  if (feedback.message.trim().length < MIN_MESSAGE_LENGTH) {
    throw new FeedbackSubmissionError("invalid", `Please tell us a little more (at least ${MIN_MESSAGE_LENGTH} characters).`);
  }
  if (feedback.message.length > MAX_MESSAGE_LENGTH) {
    throw new FeedbackSubmissionError("invalid", `Feedback must be ${MAX_MESSAGE_LENGTH} characters or fewer.`);
  }
  if (!isRating(feedback.rating)) {
    throw new FeedbackSubmissionError("invalid", "Please choose a valid star rating or leave the rating blank.");
  }

  // Keep the exact text and the explicit null rating. In particular, do not
  // trim, truncate, stringify, or coerce customer input before writing it.
  return { message: feedback.message, rating: feedback.rating };
}

function pendingFor(clientId: string, feedback: FirebaseFeedback, documentId: string): PendingFeedback {
  const existing = readPending(clientId);
  if (existing) {
    if (existing.message !== feedback.message || existing.rating !== feedback.rating) {
      throw new FeedbackSubmissionError(
        "pending",
        "A previous feedback submission is still awaiting confirmation. Please retry the saved feedback unchanged to prevent a duplicate."
      );
    }
    return existing;
  }

  const pending: PendingFeedback = {
    clientId,
    documentId,
    message: feedback.message,
    rating: feedback.rating,
    attempted: false,
    confirmed: false,
  };
  savePending(pending);
  return pending;
}

function markAttempted(clientId: string, documentId: string): void {
  const pending = readPending(clientId);
  if (pending?.documentId === documentId && !pending.attempted) {
    savePending({ ...pending, attempted: true });
  }
}

function markConfirmed(clientId: string, documentId: string): boolean {
  const pending = readPending(clientId);
  if (pending?.documentId !== documentId) return false;
  if (!pending.confirmed) savePending({ ...pending, attempted: true, confirmed: true });
  return true;
}

function notifyLateConfirmation(clientId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FEEDBACK_CONFIRMED_EVENT, { detail: { clientId } }));
}

function firebaseCode(error: unknown): string {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code.toLowerCase() : "";
}

function toFeedbackError(error: unknown): FeedbackSubmissionError {
  if (error instanceof FeedbackSubmissionError) return error;
  const code = firebaseCode(error);
  if (["permission-denied", "unauthenticated", "auth/operation-not-allowed", "auth/unauthorized-domain"].includes(code)) {
    return new FeedbackSubmissionError("permission", messages.permission);
  }
  if (code === "invalid-argument") {
    return new FeedbackSubmissionError("invalid", messages.invalid);
  }
  if (
    code.includes("network") ||
    code === "unavailable" ||
    code === "deadline-exceeded" ||
    code === "cancelled" ||
    code === "auth/timeout"
  ) {
    return new FeedbackSubmissionError("network", messages.network);
  }
  if (code === "firebase-disabled") {
    return new FeedbackSubmissionError("unavailable", messages.unavailable);
  }
  return new FeedbackSubmissionError("unavailable", messages.unavailable);
}

/**
 * Anonymous feedback → clients/{clientId}/feedback/{feedbackId}.
 * The random document ID is retained for a pending submission so a browser
 * retry or component remount can only target the same Firestore document.
 * No customer UID, name, phone, or QR token is written to the feedback record.
 */
export async function addFeedback(clientId: string, input: FirebaseFeedback): Promise<void> {
  const feedback = validateFeedback(input);
  if (!clientId || typeof clientId !== "string") {
    throw new FeedbackSubmissionError("invalid", "We couldn't identify this business. Please return home and try again.");
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new FeedbackSubmissionError("network", "You appear to be offline. Please reconnect and try again.");
  }

  const db = getDb();
  if (!db) throw new FeedbackSubmissionError("unavailable", messages.unavailable);

  let pending = readPending(clientId);
  if (pending && (pending.message !== feedback.message || pending.rating !== feedback.rating)) {
    throw new FeedbackSubmissionError(
      "pending",
      "A previous feedback submission is still awaiting confirmation. Please retry the saved feedback unchanged to prevent a duplicate."
    );
  }
  if (pending?.confirmed) return;

  // Generate the Firestore ID before sending and persist it so retries target
  // the same create-only document rather than producing duplicate documents.
  pending = pendingFor(clientId, feedback, doc(collection(db, "clients", clientId, "feedback")).id);
  const writeKey = `${clientId}/${pending.documentId}`;
  const activeWrite = inFlightWrites.get(writeKey);
  if (activeWrite) {
    try {
      await activeWrite;
      return;
    } catch (error) {
      throw toFeedbackError(error);
    }
  }

  markAttempted(clientId, pending.documentId);
  const documentRef = doc(db, "clients", clientId, "feedback", pending.documentId);
  const write = (async () => {
    // Firebase Anonymous Auth; no traditional account or profile is required.
    await withTimeout(ensureCustomer(), WRITE_TIMEOUT_MS, "auth");

    const firestoreWrite = setDoc(documentRef, {
      clientId,
      rating: feedback.rating,
      message: feedback.message,
      source: "customer_feedback",
      status: "new",
      adminReply: null,
      aiReply: null,
      repliedAt: null,
      repliedBy: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    let timeoutElapsed = false;
    // Preserve a late acknowledgement after the UI timeout. If the customer is
    // still on this screen, it can transition to the existing success screen.
    void firestoreWrite.then(() => {
      if (markConfirmed(clientId, pending!.documentId) && timeoutElapsed) {
        notifyLateConfirmation(clientId);
      }
    }).catch(() => {
      // The awaited race below turns failures into user-facing errors.
    });

    try {
      await withTimeout(firestoreWrite, WRITE_TIMEOUT_MS, "write", () => {
        timeoutElapsed = true;
      });
      markConfirmed(clientId, pending!.documentId);
    } catch (error) {
      // A prior in-flight write may have received its acknowledgement while a
      // retry was starting. Only treat it as success after Firestore confirmed it.
      if (readPending(clientId)?.documentId === pending!.documentId && readPending(clientId)?.confirmed) return;
      throw error;
    }
  })();

  inFlightWrites.set(writeKey, write);
  try {
    await write;
  } catch (error) {
    throw toFeedbackError(error);
  } finally {
    if (inFlightWrites.get(writeKey) === write) inFlightWrites.delete(writeKey);
  }
}

function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  phase: "auth" | "write",
  onTimeout?: () => void
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(
        new FeedbackSubmissionError(
          "network",
          phase === "auth" ? messages.authNetwork : messages.network
        )
      );
    }, timeoutMs);

    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
