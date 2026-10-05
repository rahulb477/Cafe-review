export interface MenuItem {
  id: string;
  /** URL segment for /[businessSlug]/menu/[itemSlug]. Defaults to a slugified `id`. */
  slug?: string;
  name: string;
  description: string;
  /** Longer copy for the detail page (falls back to `description`). */
  fullDescription?: string;
  price: number;
  /** Free-form category; the menu screen derives its filters from these. */
  category: string;
  /** Optional image path. Items without an image render a polished emoji tile. */
  image?: string;
  emoji?: string;
  /** 0–5 */
  rating?: number;

  // ---- Optional detail fields (sections are hidden when absent) ----
  ingredients?: string[];
  /** e.g. ["Vegetarian", "Contains dairy"] */
  dietaryInfo?: string[];
  allergens?: string[];
  /** Free text, e.g. "5 min". */
  preparationTime?: string;
  /** kcal */
  calories?: number;
  /** Highlighted as "Popular" in the menu. */
  featured?: boolean;
}
