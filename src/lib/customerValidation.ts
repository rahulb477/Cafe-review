import { normalizeIndianPhone } from "@/shared/phone";

/** Shared validation for the customer name + Indian mobile number. */

export const NAME_MIN = 2;
export const NAME_MAX = 50;

export function normalizeName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export function validateName(raw: string): string | null {
  const name = normalizeName(raw);
  if (!name) return "Please enter your name.";
  if (name.length < NAME_MIN) return `Name must be at least ${NAME_MIN} characters.`;
  if (name.length > NAME_MAX) return `Name must be ${NAME_MAX} characters or fewer.`;
  if (!/^[\p{L}][\p{L}\p{M} .'-]*$/u.test(name)) return "Please use letters only (spaces, . ' - allowed).";
  return null;
}

/** Returns E.164 (+91XXXXXXXXXX) or null. Delegates to the single canonical normalizer. */
export function normalizeIndianMobile(raw: string): string | null {
  return normalizeIndianPhone(raw);
}

export function validateMobile(raw: string): string | null {
  if (!raw.trim()) return "Please enter your mobile number.";
  return normalizeIndianMobile(raw) ? null : "Enter a valid 10-digit Indian mobile number.";
}

/** "+919876543210" → "+91 98765 43210" */
export function formatIndianMobile(e164: string): string {
  const m = e164.match(/^\+91(\d{5})(\d{5})$/);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}

/** Local 10-digit part for pre-filling an input. */
export function localMobilePart(e164: string): string {
  return e164.startsWith("+91") ? e164.slice(3) : e164;
}
