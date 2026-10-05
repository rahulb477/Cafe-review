/**
 * Platform-level (not client-level) configuration.
 */

/** Monthly price (INR) of the AI Review add-on per client. Billing is not wired yet. */
export const AI_MONTHLY_PRICE = 100;

/** Client served when someone opens the bare domain. */
export const DEFAULT_CLIENT_SLUG = process.env.NEXT_PUBLIC_DEFAULT_CLIENT || "bake";

/** Slugs that can never be used by a client because they collide with platform routes. */
export const RESERVED_SLUGS = ["admin", "api", "_next", "favicon.ico", "robots.txt", "sitemap.xml"];

/**
 * Public base URL used to build QR codes. Configure NEXT_PUBLIC_APP_URL in
 * production; falls back to the current browser origin.
 */
export function getAppUrl(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/+$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "http://localhost:3000";
}

/** Developer-only admin console. Enabled outside production or via ADMIN_ENABLED=true. */
export function isAdminEnabled(): boolean {
  return process.env.ADMIN_ENABLED === "true" || process.env.NODE_ENV !== "production";
}
