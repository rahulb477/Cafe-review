"use client";

import { ScreenHeader } from "@/components/ScreenHeader";
import { SocialLink } from "@/components/SocialLink";
import { StatusScreen } from "@/components/StatusScreen";
import { useClient, useClientHref } from "@/components/ClientProvider";
import { getSocialLinks, getSocialLink } from "@/services/socialService";
import { Instagram, ArrowRight, Globe } from "@/components/icons";
import { trackEvent } from "@/services/firebase/analyticsService";

export default function SocialPage() {
  const client = useClient();
  const href = useClientHref();
  const links = getSocialLinks(client);
  const instagram = getSocialLink(client, "instagram");
  const others = links.filter((l) => l.key !== "instagram");

  if (links.length === 0) {
    return (
      <div className="flex min-h-full flex-col">
        <ScreenHeader title="Social" backPath="/" />
        <StatusScreen emoji="📱" title="Coming soon" message={`${client.businessName} hasn't shared any social profiles yet.`} action={{ label: "Back to Home", href: href("/") }} />
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader title="Social" backPath="/" />
      <div className="px-5 pt-4 animate-fade-in">
        <div className="flex flex-col items-center text-center">
          {instagram ? (
            <span className="grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-purple-600 via-pink-500 to-amber-400 text-white shadow-lg">
              <Instagram width={44} height={44} />
            </span>
          ) : (
            <span className="grid h-20 w-20 place-items-center rounded-3xl bg-primary text-canvas shadow-lg">
              <Globe width={44} height={44} />
            </span>
          )}
          <h1 className="mt-5 font-display text-2xl font-bold text-primary">{instagram ? "Follow Us on Instagram" : "Follow Us"}</h1>
          <p className="mt-2 max-w-xs text-sm text-muted">Follow us for new updates, offers and delicious moments from {client.businessName}.</p>
          {instagram && (
            <a
              href={instagram.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent(client, "SOCIAL_CLICKED", { network: "instagram" })}
              className="press mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 via-pink-500 to-amber-400 py-4 font-semibold text-white shadow-md"
            >
              Follow on Instagram
              <ArrowRight width={18} height={18} />
            </a>
          )}
        </div>
        {(instagram ? others : links).length > 0 && (
          <div className="mt-8">
            <p className="mb-3 text-sm font-semibold text-muted">{instagram ? "Find us elsewhere" : "Our profiles"}</p>
            <div className="space-y-2.5 pb-6">
              {(instagram ? others : links).map((l) => (
                <SocialLink key={l.key} link={l} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
