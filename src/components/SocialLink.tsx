"use client";

import type { SocialLinkItem, SocialKey } from "@/services/socialService";
import { useClient } from "./ClientProvider";
import { trackEvent } from "@/services/firebase/analyticsService";
import { Instagram, Facebook, Youtube, Globe, ArrowRight } from "./icons";

const brandMap: Record<SocialKey, { icon: typeof Instagram; wrap: string }> = {
  instagram: { icon: Instagram, wrap: "bg-gradient-to-br from-purple-600 via-pink-500 to-amber-400 text-white" },
  facebook: { icon: Facebook, wrap: "bg-[#1877F2] text-white" },
  youtube: { icon: Youtube, wrap: "bg-[#FF0000] text-white" },
  website: { icon: Globe, wrap: "bg-primary text-canvas" },
};

export function SocialLink({ link }: { link: SocialLinkItem }) {
  const brand = brandMap[link.key];
  const Icon = brand.icon;
  const client = useClient();
  return (
    <a href={link.url} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent(client, "SOCIAL_CLICKED", { network: link.key })} className="press flex items-center gap-4 rounded-2xl bg-surface p-3 shadow-[0_4px_18px_-12px_rgba(0,0,0,0.35)]">
      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${brand.wrap}`}>
        <Icon width={24} height={24} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-primary">{link.label}</span>
        <span className="block truncate text-xs text-muted">{link.handle}</span>
      </span>
      <ArrowRight width={18} height={18} className="text-primary/40" />
    </a>
  );
}
