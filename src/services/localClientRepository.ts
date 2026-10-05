import { clients } from "@/config/clients";
import { RESERVED_SLUGS } from "@/config/platform";
import type { ClientConfig } from "@/types/client";
import { getItemSlug } from "./menuService";

/**
 * Bundled demo clients (fallback data source). Universal: safe for server and
 * the developer admin console.
 */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !RESERVED_SLUGS.includes(slug);
}

export function normalizeSlug(slug: string | undefined | null): string | null {
  if (!slug) return null;
  try {
    const s = decodeURIComponent(slug).toLowerCase();
    return isValidSlug(s) ? s : null;
  } catch {
    return null;
  }
}

export function getLocalClientBySlug(slug: string): ClientConfig | null {
  return clients.find((c) => c.slug === slug) ?? null;
}

export function getLocalClient(id: string): ClientConfig | null {
  return clients.find((c) => c.id === id) ?? null;
}

export function listLocalClients(): ClientConfig[] {
  return clients;
}

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Validates a client config. Used by the admin editor. */
export function validateClientConfig(c: Partial<ClientConfig>, others: Pick<ClientConfig, "id" | "slug">[] = clients): string[] {
  const issues: string[] = [];
  if (!c.id) issues.push("id is required");
  if (!c.slug) issues.push("slug is required");
  else if (!isValidSlug(c.slug)) issues.push("slug must be lowercase-kebab-case and not reserved");
  if (!c.businessName) issues.push("businessName is required");
  if (!c.displayName) issues.push("displayName is required");
  if (!c.theme) issues.push("theme is required");
  else {
    const keys = ["primary", "primaryDark", "secondary", "accent", "onAccent", "background", "surface", "text", "muted"] as const;
    for (const k of keys) if (!c.theme[k] || !HEX_RE.test(c.theme[k])) issues.push(`theme.${k} must be a hex color`);
  }
  if (!c.googleReviewUrl) issues.push("googleReviewUrl is missing (review button will show a notice)");
  else if (!/^https?:\/\//.test(c.googleReviewUrl)) issues.push("googleReviewUrl must be an http(s) URL");
  if (!c.logo) issues.push("logo is missing (initials badge will be used)");
  if (!c.loyalty) issues.push("loyalty is required");
  else if (c.loyalty.enabled && (!c.loyalty.stampTarget || c.loyalty.stampTarget < 1 || c.loyalty.stampTarget > 20)) issues.push("loyalty.stampTarget must be between 1 and 20");
  if (!c.wifi) issues.push("wifi is required");
  else if (c.wifi.enabled && !c.wifi.ssid) issues.push("wifi.ssid is required when wifi is enabled");
  if (!Array.isArray(c.menu)) issues.push("menu must be an array");
  else {
    const seen = new Set<string>();
    for (const item of c.menu) {
      const slug = getItemSlug(item);
      if (!slug) issues.push(`menu item "${item.name}" has no usable slug`);
      else if (seen.has(slug)) issues.push(`duplicate menu slug "${slug}"`);
      seen.add(slug);
    }
  }
  if (!c.aiReview) issues.push("aiReview is required");
  if (!c.reviewSettings) issues.push("reviewSettings is required");
  if (c.slug && others.some((x) => x.slug === c.slug && x.id !== c.id)) issues.push("slug already used by another client");
  return issues;
}
