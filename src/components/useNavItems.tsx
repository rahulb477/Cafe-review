"use client";

import type { ReactNode } from "react";
import { useClient } from "./ClientProvider";
import { getSocialLinks } from "@/services/socialService";
import { getWifiInfo } from "@/services/wifiService";
import { Home, QrIcon, Heart, Google, Utensils, Wifi, Chat, Grid, Instagram, Globe, Settings } from "./icons";

export interface NavItem {
  path: string;
  label: string;
  icon: ReactNode;
  accent: string;
}

/** Single source of truth for which features a client exposes (Home list + drawer). */
export function useNavItems(opts: { includeHome?: boolean; includeSettings?: boolean; includeLoyalty?: boolean } = {}): NavItem[] {
  const client = useClient();
  const socials = getSocialLinks(client);
  const hasInstagram = socials.some((s) => s.key === "instagram");
  const items: NavItem[] = [];

  if (opts.includeHome) items.push({ path: "/", label: "Home", icon: <Home width={22} height={22} />, accent: "" });
  if (client.loyalty.enabled && opts.includeLoyalty !== false && opts.includeHome) {
    items.push({ path: "/qr", label: "My QR Code", icon: <QrIcon width={22} height={22} />, accent: "" });
    items.push({ path: "/stamps", label: "My Stamps", icon: <Heart width={22} height={22} />, accent: "" });
  }
  items.push({ path: "/review", label: "Leave a Google Review", icon: <Google width={22} height={22} />, accent: "bg-white" });
  if (client.menu.length > 0) items.push({ path: "/menu", label: "View Menu", icon: <Utensils width={20} height={20} />, accent: "bg-accent/15 text-accent" });
  if (getWifiInfo(client).enabled) items.push({ path: "/wifi", label: "Connect to Wi-Fi", icon: <Wifi width={20} height={20} />, accent: "bg-emerald-100 text-emerald-600" });
  items.push({ path: "/feedback", label: "Leave Anonymous Feedback", icon: <Chat width={20} height={20} />, accent: "bg-sky-100 text-sky-600" });
  items.push({ path: "/sudoku", label: "Play Sudoku", icon: <Grid width={20} height={20} />, accent: "bg-purple-100 text-purple-600" });
  if (socials.length > 0)
    items.push({
      path: "/instagram",
      label: hasInstagram ? "Follow on Instagram" : "Follow Us",
      icon: hasInstagram ? <Instagram width={20} height={20} /> : <Globe width={20} height={20} />,
      accent: hasInstagram ? "bg-gradient-to-br from-pink-500 to-amber-400 text-white" : "bg-primary/10 text-primary",
    });
  if (opts.includeSettings) items.push({ path: "/settings", label: "Settings", icon: <Settings width={22} height={22} />, accent: "" });
  return items;
}
