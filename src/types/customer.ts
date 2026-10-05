/** Customer-entered identity used for loyalty (stored privately at customers/{uid}). */
export interface CustomerProfile {
  name: string;
  /** E.164 Indian mobile, e.g. +919876543210 */
  phone: string;
}

/**
 * idle/loading — not resolved yet · missing — no profile, show the form ·
 * ready — profile exists · unavailable — auth/backend unreachable · local — demo tenant
 */
export type ProfileStatus = "idle" | "loading" | "missing" | "ready" | "unavailable";
