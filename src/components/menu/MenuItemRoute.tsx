"use client";

import { useEffect, useMemo } from "react";
import { useClient, useSession } from "@/components/ClientProvider";
import { getMenuItem } from "@/services/menuService";
import { trackEvent } from "@/services/firebase/analyticsService";
import { MenuItemDetail } from "./MenuItemDetail";
import { ItemNotFound } from "./ItemNotFound";

export function MenuItemRoute({ itemSlug }: { itemSlug: string }) {
  const client = useClient();
  const tableNumber = useSession((s) => s.tableNumber);
  const item = useMemo(() => getMenuItem(client, itemSlug), [client, itemSlug]);
  const itemId = item?.id;

  useEffect(() => {
    if (itemId) trackEvent(client, "MENU_ITEM_VIEWED", { menuItemId: itemId, tableId: tableNumber });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per item view
  }, [client.id, itemId]);

  return item ? <MenuItemDetail item={item} /> : <ItemNotFound />;
}
