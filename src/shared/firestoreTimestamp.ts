const DASH = "—";
const UNIX_SECONDS_THRESHOLD = 100_000_000_000;
const NANOS_PER_SECOND = 1_000_000_000;

export interface FirestoreTimestampFormatOptions {
  /** Display a localised 12-hour time after the date. */
  withTime?: boolean;
  locale?: string;
  timeZone?: string;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function validDate(milliseconds: number): Date | null {
  if (!Number.isFinite(milliseconds)) return null;
  const date = new Date(milliseconds);
  return Number.isFinite(date.getTime()) ? date : null;
}

function fromEpoch(value: number): Date | null {
  return validDate(Math.abs(value) < UNIX_SECONDS_THRESHOLD ? value * 1000 : value);
}

/**
 * Safely converts Firestore/browser/serialized timestamp shapes to a Date.
 * Invalid or absent values return null; this function never returns an invalid Date.
 */
export function parseFirestoreTimestamp(value: unknown): Date | null {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) return validDate(value.getTime());

  if (typeof value === "number") return fromEpoch(value);

  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return null;
    if (/^-?\d+(?:\.\d+)?$/.test(text)) {
      const numeric = Number(text);
      return Number.isFinite(numeric) ? fromEpoch(numeric) : null;
    }
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? validDate(parsed) : null;
  }

  if (typeof value !== "object") return null;

  const timestamp = value as {
    toDate?: () => unknown;
    toMillis?: () => unknown;
    seconds?: unknown;
    nanoseconds?: unknown;
    _seconds?: unknown;
    _nanoseconds?: unknown;
  };

  if (typeof timestamp.toDate === "function") {
    try {
      const date = timestamp.toDate();
      if (date instanceof Date) return validDate(date.getTime());
    } catch {
      return null;
    }
  }

  if (typeof timestamp.toMillis === "function") {
    try {
      const milliseconds = finiteNumber(timestamp.toMillis());
      if (milliseconds !== null) return validDate(milliseconds);
    } catch {
      return null;
    }
  }

  const secondsValue = timestamp.seconds ?? timestamp._seconds;
  const seconds = finiteNumber(secondsValue);
  if (seconds === null || !Number.isInteger(seconds)) return null;

  const nanosValue = timestamp.nanoseconds ?? timestamp._nanoseconds;
  const nanos = nanosValue === undefined ? 0 : finiteNumber(nanosValue);
  if (nanos === null || !Number.isInteger(nanos) || nanos < 0 || nanos >= NANOS_PER_SECOND) return null;

  return validDate(seconds * 1000 + nanos / 1_000_000);
}

/**
 * The shared UI formatter for Firestore timestamps. Missing, malformed, or
 * unformattable values always display an em dash (never a browser error string).
 */
export function formatFirestoreTimestamp(value: unknown, options: FirestoreTimestampFormatOptions = {}): string {
  const date = parseFirestoreTimestamp(value);
  if (!date) return DASH;

  try {
    return new Intl.DateTimeFormat(options.locale ?? "en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      ...(options.withTime ? { hour: "2-digit", minute: "2-digit", hour12: true } : {}),
      ...(options.timeZone ? { timeZone: options.timeZone } : {}),
    }).format(date);
  } catch {
    return DASH;
  }
}

/** Backwards-compatible names for existing shared Admin/Staff integrations. */
export const toDateSafe = parseFirestoreTimestamp;
export const formatFirestoreDate = formatFirestoreTimestamp;
