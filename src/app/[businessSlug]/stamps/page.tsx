"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { StampGrid } from "@/components/StampCard";
import { StatusScreen } from "@/components/StatusScreen";
import { LoyaltySyncNotice } from "@/components/LoyaltySyncNotice";
import { ProfileGate } from "@/components/customer/ProfileGate";
import { useClient, useClientHref, useSession } from "@/components/ClientProvider";
import { loyaltyService } from "@/services/loyaltyService";
import { trackEvent } from "@/services/firebase/analyticsService";
import { formatFirestoreTimestamp } from "@/shared/firestoreTimestamp";
import { formatCooldownRemaining, getStampCooldown } from "@/shared/loyaltyDisplay";
import { Coffee } from "@/components/icons";

export default function StampsPage() {
  const client = useClient();
  const href = useClientHref();
  const stamps = useSession((s) => s.stamps);
  const currentStamps = useSession((s) => s.currentStamps);
  const lifetimeStamps = useSession((s) => s.lifetimeStamps);
  const lastStampAt = useSession((s) => s.lastStampAt);
  const loyaltyAccountExists = useSession((s) => s.loyaltyAccountExists);
  const stampHistoryCount = useSession((s) => s.stampHistoryCount);
  const loyaltyStatus = useSession((s) => s.loyaltyStatus);
  const rewardStatus = useSession((s) => s.rewardStatus);
  const [clock, setClock] = useState(() => Date.now());
  const { loyalty } = client;

  useEffect(() => {
    if (loyalty.enabled) trackEvent(client, "LOYALTY_VIEWED");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per visit
  }, [client.id, loyalty.enabled]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

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
  const cooldown = getStampCooldown(lastStampAt, clock);
  const firstStampEligible = loyaltyStatus === "live"
    && loyaltyAccountExists === false
    && stampHistoryCount === 0;
  const stampEligible = loyaltyStatus !== "live"
    ? null
    : cooldown.eligible ?? (firstStampEligible ? true : null);
  const cooldownStatus = stampEligible === true
    ? "Eligible now"
    : stampEligible === false
      ? "Not eligible yet"
      : loyaltyStatus === "live" && stampHistoryCount === null
        ? "Checking authoritative history"
        : "Could not verify eligibility";
  const currentStampsDisplay = loyaltyStatus === "live"
    ? String(currentStamps ?? stamps)
    : "—";
  const lifetimeStampsDisplay = loyaltyStatus === "live" && lifetimeStamps !== null
    ? String(lifetimeStamps)
    : "—";
  const lastStampDisplay = loyaltyStatus === "live"
    ? formatFirestoreTimestamp(lastStampAt, { withTime: true })
    : "—";
  const nextEligibleDisplay = stampEligible === true
    ? "Eligible now"
    : cooldown.state === "active"
      ? formatFirestoreTimestamp(cooldown.nextStampAt, { withTime: true })
      : "—";
  const remainingCooldown = stampEligible === true
    ? "None"
    : cooldown.state === "active"
      ? formatCooldownRemaining(cooldown.remainingMs)
      : "—";

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
            <dl className="mt-5 divide-y divide-line-soft border-t border-line-soft text-sm">
              {[
                ["Current stamps", currentStampsDisplay],
                ["Lifetime stamps", lifetimeStampsDisplay],
                ["Last stamp", lastStampDisplay],
                ["Next eligible stamp", nextEligibleDisplay],
                ["Remaining cooldown", remainingCooldown],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="text-muted">{label}</dt>
                  <dd className="text-right font-semibold text-primary">{value}</dd>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-muted">Stamp status</dt>
                <dd className={`text-right font-bold ${stampEligible === false ? "text-danger" : "text-primary"}`}>
                  {cooldownStatus}
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-center text-[11px] text-muted">
              This status is informational. Staff confirms eligibility when your stamp is recorded.
            </p>
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
