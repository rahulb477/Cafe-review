import type { ClientConfig } from "@/types/client";
import type { MenuItem } from "@/types/menu";

/**
 * Menu service — always scoped to one client, so items can never leak between
 * businesses. Replace the bodies with API/DB calls later without UI changes.
 */
export async function getMenu(client: ClientConfig): Promise<MenuItem[]> {
  await new Promise((r) => setTimeout(r, 300));
  if (!Array.isArray(client.menu)) throw new Error("Menu unavailable");
  return client.menu;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getItemSlug(item: MenuItem): string {
  return item.slug ? slugify(item.slug) : slugify(item.id);
}

/** Looks up an item ONLY within the given client's menu. */
export function getMenuItem(client: ClientConfig, itemSlug: string): MenuItem | null {
  let wanted: string;
  try {
    wanted = slugify(decodeURIComponent(itemSlug));
  } catch {
    return null;
  }
  return client.menu.find((i) => getItemSlug(i) === wanted) ?? null;
}

/** Same-category items first, then featured/others from the same client. */
export function getRelatedItems(client: ClientConfig, item: MenuItem, limit = 6): MenuItem[] {
  const others = client.menu.filter((i) => i.id !== item.id);
  const same = others.filter((i) => i.category === item.category);
  const rest = others.filter((i) => i.category !== item.category).sort((a, b) => Number(!!b.featured) - Number(!!a.featured));
  return [...same, ...rest].slice(0, limit);
}

/** "All" + configured order, falling back to categories found in the menu. */
export function getCategories(client: ClientConfig): string[] {
  const fromMenu = Array.from(new Set(client.menu.map((m) => m.category)));
  const configured = client.menuCategories ?? [];
  const ordered = configured.length
    ? [...configured.filter((c) => fromMenu.includes(c)), ...fromMenu.filter((c) => !configured.includes(c))]
    : fromMenu;
  return ["All", ...ordered];
}
