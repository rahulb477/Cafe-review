"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { StampGrid } from "@/components/StampCard";
import { StatusScreen } from "@/components/StatusScreen";
import { LoyaltySyncNotice } from "@/components/LoyaltySyncNotice";
import { ProfileGate } from "@/components/customer/ProfileGate";
import { useClient, useClientHref, useSession } from "@/components/ClientProvider";
import { loyaltyService } from "@/services/loyaltyService";
import { trackEvent } from "@/services/firebase/analyticsService";
import { Coffee } from "@/components/icons";

export default function StampsPage() {
  const client = useClient();
  const href = useClientHref();
  const stamps = useSession((s) => s.stamps);
  const rewardStatus = useSession((s) => s.rewardStatus);
  const { loyalty } = client;

  useEffect(() => {
    if (loyalty.enabled) trackEvent(client, "LOYALTY_VIEWED");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per visit
  }, [client.id, loyalty.enabled]);

  if (!loyalty.enabled) {
    return (
      <div className="flex min-h-full flex-col">
        <ScreenHeader title="Your Stamps" backPath="/" />
        <StatusScreen
          emoji="🎟️"
          title="No loyalty program"
          message={`${client.businessName} doesn't run a stamp card right now.`}
          action={{ label: "Back to Home", href: href("/") }}
        />
      </div>
    );
  }

  const earned = loyaltyService.hasReward(stamps, loyalty, rewardStatus);
  const rewardCopy = loyalty.rewardDescription ?? `Collect ${loyalty.stampTarget} stamps to get a ${loyalty.rewardName.toLowerCase()} on us!`;

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader title="Your Stamps" backPath="/" />
      <ProfileGate>
        <div className="px-5 pt-4 animate-fade-in">
          <div className="rounded-3xl bg-surface p-6 shadow-card">
            <StampGrid stamps={stamps} target={loyalty.stampTarget} />
            <div className="mt-6 text-center">
              <p className="font-display text-2xl font-bold text-primary" aria-live="polite">
                {loyaltyService.capped(stamps, loyalty)} / {loyalty.stampTarget} stamps
              </p>
              <p className="text-sm text-muted">towards a {loyalty.rewardName.toLowerCase()}</p>
            </div>
            <LoyaltySyncNotice />
          </div>

          <div
            className={`mt-4 flex items-center gap-4 rounded-2xl p-4 transition-colors ${earned ? "animate-pop-in bg-accent/20 ring-2 ring-accent" : "bg-secondary"}`}
          >
            <span
              className={`grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl ${earned ? "bg-accent text-on-accent" : "bg-primary/10 text-primary-mid"}`}
            >
              {loyalty.rewardImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- admin-hosted image on any host
                <img src={loyalty.rewardImage} alt="" className="h-full w-full object-cover" />
              ) : (
                <Coffee width={28} height={28} />
              )}
            </span>
            <div className="flex-1">
              <p className="font-bold text-primary">{earned ? `${loyalty.rewardName} Earned! 🎉` : loyalty.rewardName}</p>
              <p className="text-xs text-muted">{earned ? "Show this screen to our staff to redeem your reward." : rewardCopy}</p>
            </div>
          </div>

          <div className="mt-6 space-y-3 pb-6">
            <Link
              href={href("/qr")}
              className="press flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-button font-semibold text-canvas shadow-md shadow-primary/20"
            >
              Show my QR to earn a stamp
            </Link>
            <p className="text-center text-[11px] text-muted">Stamps are added by our staff when they scan your QR code.</p>
          </div>
        </div>
      </ProfileGate>
    </div>
  );
}
