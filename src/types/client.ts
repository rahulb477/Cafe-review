import type { MenuItem } from "./menu";
import type { ReviewSettings } from "./review";
import type { LoyaltySettings } from "./loyalty";

export interface ClientTheme {
  /** Main brand color: buttons, headings, nav, icons. */
  primary: string;
  /** Darker shade used for hover/pressed and dark panels. */
  primaryDark: string;
  /** Soft tinted surface (chips, secondary buttons). */
  secondary: string;
  /** Highlight color (stars, progress, rewards). */
  accent: string;
  /** Text/icon color placed on top of the accent color. */
  onAccent: string;
  /** App background. */
  background: string;
  /** Card surface. */
  surface: string;
  /** Body text color. */
  text: string;
  /** Secondary/muted text color. */
  muted: string;
  /** Primary button background (defaults to primary). */
  button?: string;
  /** Base radius, e.g. "1rem". Cards scale from this. */
  borderRadius: string;
  /** Optional display font stack for headings. */
  fontDisplay?: string;
}

export interface ClientSocialLinks {
  instagram?: string;
  facebook?: string;
  youtube?: string;
  website?: string;
}

export interface ClientWifi {
  enabled: boolean;
  ssid?: string;
  /** Public, admin-approved message shown to customers (Firestore: wifi.message). */
  hint?: string;
  /** Password is NEVER stored here; it is read server-side from WIFI_PASSWORD_<SLUG>. */
}

export interface ClientAiReview {
  enabled: boolean;
  /** Max real-AI generations per calendar month. Mock generation is unlimited. */
  monthlyLimit: number;
}

/** Where a client's configuration was loaded from. */
export type ClientSource = "firebase" | "local";

export interface ClientConfig {
  id: string;
  /** "firebase" = live Firestore tenant; "local" = bundled demo fallback. */
  source: ClientSource;
  slug: string;
  businessName: string;
  /** Short name shown in the logo wordmark (e.g. "BAKE"). */
  displayName: string;
  /** Subtitle under the wordmark (e.g. "CAFÉ & BAKERY"). */
  displaySubtitle?: string;
  logo?: string;
  favicon?: string;
  tagline: string;
  description: string;
  currency: string;
  theme: ClientTheme;
  coverImage?: string;
  googleReviewUrl?: string;
  socialLinks: ClientSocialLinks;
  wifi: ClientWifi;
  loyalty: LoyaltySettings;
  aiReview: ClientAiReview;
  menu: MenuItem[];
  /** Optional explicit category order; otherwise derived from the menu. */
  menuCategories?: string[];
  reviewSettings: ReviewSettings;
}
