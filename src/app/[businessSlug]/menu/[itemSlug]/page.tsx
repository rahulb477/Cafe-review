import type { Metadata } from "next";
import { getClientBySlug } from "@/services/clientService";
import { getMenuItem } from "@/services/menuService";
import { MenuItemRoute } from "@/components/menu/MenuItemRoute";

type Params = Promise<{ businessSlug: string; itemSlug: string }>;

// Items are managed in Firestore by the Admin App, so they render on demand.
export const dynamicParams = true;
export const revalidate = 60;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { businessSlug, itemSlug } = await params;
  const client = await getClientBySlug(businessSlug).catch(() => null);
  const item = client ? getMenuItem(client, itemSlug) : null;
  if (!client || !item) return { title: "Item Not Found", robots: { index: false } };
  return {
    title: item.name,
    description: item.description.slice(0, 160),
    openGraph: { title: `${item.name} · ${client.businessName}`, description: item.description.slice(0, 160), images: item.image ? [item.image] : undefined },
  };
}

/**
 * The item is resolved from the CURRENT client's live menu (Firestore listener),
 * so Admin edits/new items appear without a redeploy. Unknown business is handled
 * by the [businessSlug] layout; unknown item renders the branded Item Not Found.
 */
export default async function MenuItemPage({ params }: { params: Params }) {
  const { itemSlug } = await params;
  return <MenuItemRoute itemSlug={itemSlug} />;
}
