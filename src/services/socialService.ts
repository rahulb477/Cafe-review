import type { ClientConfig, ClientSocialLinks } from "@/types/client";

export type SocialKey = keyof ClientSocialLinks;

export interface SocialLinkItem {
  key: SocialKey;
  label: string;
  url: string;
  handle: string;
}

const labels: Record<SocialKey, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  website: "Website",
};

const order: SocialKey[] = ["instagram", "facebook", "youtube", "website"];

function handleFromUrl(key: SocialKey, url: string): string {
  try {
    const u = new URL(url);
    if (key === "website") return u.hostname.replace(/^www\./, "");
    const path = u.pathname.replace(/^\/+|\/+$/g, "");
    return path ? (path.startsWith("@") ? path : `@${path}`) : u.hostname;
  } catch {
    return url;
  }
}

/** Only returns links that are configured with a valid http(s) URL. */
export function getSocialLinks(client: ClientConfig): SocialLinkItem[] {
  return order
    .map((key) => ({ key, url: client.socialLinks[key] }))
    .filter((x): x is { key: SocialKey; url: string } => !!x.url && /^https?:\/\//.test(x.url))
    .map(({ key, url }) => ({ key, url, label: labels[key], handle: handleFromUrl(key, url) }));
}

export function getSocialLink(client: ClientConfig, key: SocialKey): SocialLinkItem | undefined {
  return getSocialLinks(client).find((s) => s.key === key);
}
