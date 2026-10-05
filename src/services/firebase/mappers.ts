import type { ClientConfig, ClientSocialLinks, ClientTheme } from "@/types/client";
import type { MenuItem } from "@/types/menu";
import { isHex, luminance, mix, normalizeHex } from "@/lib/color";
import { firebaseConfig, PUBLIC_CLIENT_STATUSES } from "./firebaseConfig";

/**
 * Normalises Firestore documents written by the Admin App into the customer
 * app's types. Works on plain objects from both the server REST reader and the
 * browser SDK (`doc.data()`), and tolerates missing/legacy fields.
 */

type Raw = Record<string, unknown>;

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const num = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
};
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);

/** Accepts arrays or comma/newline separated strings. */
export function toList(v: unknown): string[] | undefined {
  const items = Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : String(x ?? ""))) : typeof v === "string" ? v.split(/[,\n;]+/) : [];
  const clean = items.map((s) => s.trim()).filter(Boolean);
  return clean.length ? Array.from(new Set(clean)) : undefined;
}

/** Resolves admin-provided asset references (http, /public, gs://, or Storage paths). */
export function resolveAssetUrl(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  if (/^https?:\/\//i.test(s) || s.startsWith("/")) return s;
  let bucket = firebaseConfig.storageBucket;
  let path = s;
  const gs = s.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (gs) {
    bucket = gs[1];
    path = gs[2];
  }
  if (!bucket || /\s/.test(path)) return undefined;
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`;
}

function socialUrl(key: keyof ClientSocialLinks, v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  if (/^https?:\/\//i.test(s)) return s;
  const handle = s.replace(/^@/, "");
  if (!/^[\w.\-]+$/.test(handle) && key !== "website") return undefined;
  switch (key) {
    case "instagram":
      return `https://www.instagram.com/${handle}`;
    case "facebook":
      return `https://www.facebook.com/${handle}`;
    case "youtube":
      return `https://www.youtube.com/@${handle}`;
    case "website":
      return /^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(s) ? `https://${s}` : undefined;
  }
}

/** Derives the full design-token set from the admin's (possibly partial) palette. */
export function deriveTheme(raw: unknown): ClientTheme {
  const t = obj(raw);
  const primary = isHex(t.primary) ? normalizeHex(t.primary) : "#4a2c18";
  const background = isHex(t.background) ? normalizeHex(t.background) : "#faf4ea";
  const accent = isHex(t.accent) ? normalizeHex(t.accent) : "#e3a43a";
  const text = isHex(t.text) ? normalizeHex(t.text) : primary;
  const radius = typeof t.borderRadius === "string" && /^\d+(\.\d+)?(rem|px)$/.test(t.borderRadius) ? t.borderRadius : num(t.borderRadius) ? `${num(t.borderRadius)}px` : "1rem";
  return {
    primary,
    primaryDark: isHex(t.primaryDark) ? normalizeHex(t.primaryDark) : mix(primary, "#000000", 0.22),
    // Soft tinted surface for chips/secondary buttons (admin "secondary" is a brand color, used for buttons below).
    secondary: isHex(t.surfaceTint) ? normalizeHex(t.surfaceTint) : mix(background, primary, 0.08),
    accent,
    onAccent: luminance(accent) > 0.45 ? mix(text, "#000000", 0.3) : "#ffffff",
    background,
    surface: isHex(t.surface) ? normalizeHex(t.surface) : mix(background, "#ffffff", 0.6),
    text,
    muted: isHex(t.muted) ? normalizeHex(t.muted) : mix(text, background, 0.45),
    button: isHex(t.button) ? normalizeHex(t.button) : primary,
    borderRadius: radius,
  };
}

export function isPublicClientStatus(status: unknown): boolean {
  if (status === undefined || status === null || status === "") return true;
  return typeof status === "string" && PUBLIC_CLIENT_STATUSES.includes(status.toLowerCase());
}

export interface RawCategory {
  id: string;
  data: Raw;
}
export interface RawItem {
  id: string;
  data: Raw;
}

/** Active categories ordered by sortOrder. */
export function mapCategories(cats: RawCategory[]) {
  return cats
    .filter((c) => bool(c.data.active, true) && str(c.data.name))
    .sort((a, b) => (num(a.data.sortOrder) ?? 999) - (num(b.data.sortOrder) ?? 999))
    .map((c) => ({ id: c.id, name: str(c.data.name)! }));
}

export function mapMenuItems(items: RawItem[], categories: { id: string; name: string }[]): MenuItem[] {
  const byId = new Map(categories.map((c) => [c.id, c.name]));
  return items
    .filter((i) => bool(i.data.active, true) && str(i.data.name) && num(i.data.price) !== undefined)
    .sort((a, b) => (num(a.data.sortOrder) ?? 999) - (num(b.data.sortOrder) ?? 999))
    .map(({ id, data: d }) => {
      const prep = d.preparationTime;
      const rating = num(d.rating);
      const categoryId = str(d.categoryId);
      return {
        id,
        slug: str(d.slug),
        name: str(d.name)!,
        description: str(d.description) ?? "",
        fullDescription: str(d.fullDescription),
        price: num(d.price)!,
        category: (categoryId && byId.get(categoryId)) || str(d.category) || "Other",
        image: resolveAssetUrl(d.image),
        emoji: str(d.emoji),
        rating: rating !== undefined ? Math.max(0, Math.min(5, rating)) : undefined,
        ingredients: toList(d.ingredients),
        dietaryInfo: toList(d.dietaryInfo),
        allergens: toList(d.allergens),
        preparationTime: num(prep) !== undefined ? `${num(prep)} min` : str(prep),
        calories: num(d.calories),
        featured: d.featured === true,
      } satisfies MenuItem;
    });
}

const DEFAULT_REVIEW = { shareTitle: "Share Your Experience", shareSubtitle: "Help us grow with your valuable review" };

/** Builds a full ClientConfig from the Firestore client document + menu subcollections. */
export function mapClient(id: string, d: Raw, categories: RawCategory[], items: RawItem[]): ClientConfig {
  const wifi = obj(d.wifi);
  const loyalty = obj(d.loyalty);
  const ai = obj(d.aiReview);
  const social = obj(d.socialLinks);
  const review = obj(d.reviewSettings);
  const cats = mapCategories(categories);
  const businessName = str(d.businessName) ?? str(d.displayName) ?? "Our Café";
  const displayName = str(d.displayName) ?? businessName.toUpperCase();
  const stampTarget = Math.round(num(loyalty.stampTarget) ?? 8);

  return {
    id: str(d.id) ?? id,
    source: "firebase",
    slug: (str(d.slug) ?? id).toLowerCase(),
    businessName,
    displayName,
    displaySubtitle: str(d.displaySubtitle) ?? str(d.category)?.toUpperCase(),
    logo: resolveAssetUrl(d.logo),
    favicon: resolveAssetUrl(d.favicon) ?? resolveAssetUrl(d.logo),
    tagline: str(d.tagline) ?? "",
    description: str(d.description) ?? `${businessName} — customer experience`,
    currency: str(d.currency) ?? "₹",
    theme: deriveTheme(d.theme),
    coverImage: resolveAssetUrl(d.coverImage),
    googleReviewUrl: str(d.googleReviewUrl) && /^https?:\/\//i.test(str(d.googleReviewUrl)!) ? str(d.googleReviewUrl) : undefined,
    socialLinks: {
      instagram: socialUrl("instagram", social.instagram),
      facebook: socialUrl("facebook", social.facebook),
      youtube: socialUrl("youtube", social.youtube),
      website: socialUrl("website", social.website),
    },
    wifi: { enabled: bool(wifi.enabled, false) && !!str(wifi.ssid), ssid: str(wifi.ssid), hint: str(wifi.message) ?? str(wifi.hint) },
    loyalty: {
      enabled: bool(loyalty.enabled, true),
      stampTarget: Math.max(1, Math.min(20, stampTarget)),
      rewardName: str(loyalty.rewardName) ?? "Free Reward",
      rewardDescription: str(loyalty.rewardDescription),
      rewardImage: resolveAssetUrl(loyalty.rewardImage),
    },
    aiReview: { enabled: bool(ai.enabled, true), monthlyLimit: Math.max(0, Math.round(num(ai.monthlyLimit) ?? 200)) },
    menu: mapMenuItems(items, cats),
    menuCategories: cats.map((c) => c.name),
    reviewSettings: {
      shareTitle: str(review.shareTitle) ?? DEFAULT_REVIEW.shareTitle,
      shareSubtitle: str(review.shareSubtitle) ?? DEFAULT_REVIEW.shareSubtitle,
    },
  };
}
