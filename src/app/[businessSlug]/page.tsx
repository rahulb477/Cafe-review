"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useClient, useClientHref, useSession } from "@/components/ClientProvider";
import { useUi } from "@/components/AppShell";
import { loyaltyService } from "@/services/loyaltyService";
import { StampGrid } from "@/components/StampCard";
import { ActionRow } from "@/components/ActionRow";
import { ClientLogo } from "@/components/ClientLogo";
import { useNavItems } from "@/components/useNavItems";
import { MenuIcon, QrIcon, Heart } from "@/components/icons";
import { DiagnosticDetail } from "@/components/DiagnosticDetail";

export default function HomePage() {
  const client = useClient();
  const href = useClientHref();
  const stamps = useSession((s) => s.stamps);
  const rewardStatus = useSession((s) => s.rewardStatus);
  const loyaltyStatus = useSession((s) => s.loyaltyStatus);
  const tableNumber = useSession((s) => s.tableNumber);
  const { openDrawer } = useUi();
  const actions = useNavItems();
  const [coverFailed, setCoverFailed] = useState(false);
  const { loyalty } = client;

  return (
    <div className="flex flex-col animate-fade-in">
      <div className="relative h-52 w-full bg-gradient-to-br from-primary to-primary-dark">
        {client.coverImage && !coverFailed && (
          <Image
            src={client.coverImage}
            alt={`Inside ${client.businessName}`}
            fill
            priority
            unoptimized={/^https?:\/\//i.test(client.coverImage)}
            className="object-cover"
            sizes="460px"
            onError={() => setCoverFailed(true)}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-primary-dark/85 via-primary-dark/25 to-primary-dark/40" />
        <button
          onClick={openDrawer}
          aria-label="Open menu"
          className="press absolute right-3 grid h-10 w-10 place-items-center rounded-full bg-black/35 text-white backdrop-blur-sm"
          style={{ top: "calc(var(--safe-top) + 0.75rem)" }}
        >
          <MenuIcon />
        </button>
        {tableNumber && (
          <span className="absolute left-3 rounded-full bg-black/35 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm" style={{ top: "calc(var(--safe-top) + 0.9rem)" }}>
            Table {tableNumber}
          </span>
        )}
        <div className="absolute bottom-3 left-4">
          <ClientLogo size="md" light />
        </div>
      </div>

      <div className="-mt-6 space-y-4 px-4 pb-6">
        {loyalty.enabled ? (
          <div className="relative rounded-3xl bg-surface p-4 shadow-[0_10px_30px_-14px_color-mix(in_srgb,var(--brand-primary)_40%,transparent)] animate-slide-up">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-accent/15 text-accent">
                <Heart filled width={22} height={22} />
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold leading-tight text-primary">{loyaltyService.progressLabel(stamps, loyalty)}</p>
                <p className="text-xs text-muted">
                  {loyaltyStatus === "connecting"
                    ? "Syncing your stamps…"
                    : loyaltyStatus === "unavailable"
                      ? "Stamp sync is temporarily unavailable"
                      : loyaltyService.hasReward(stamps, loyalty, rewardStatus)
                        ? `🎉 ${loyalty.rewardName} unlocked!`
                        : `${loyaltyService.remaining(stamps, loyalty)} more to go`}
                </p>
              </div>
            </div>
            <div className="mt-3">
              <StampGrid stamps={stamps} target={loyalty.stampTarget} compact />
            </div>
            {loyaltyStatus === "unavailable" && <DiagnosticDetail />}
            <Link
              href={href("/qr")}
              className="press mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-button py-3.5 font-semibold text-canvas shadow-md shadow-primary/20 hover:bg-primary-dark"
            >
              <QrIcon width={20} height={20} />
              Show my QR code
            </Link>
          </div>
        ) : (
          <div className="relative rounded-3xl bg-surface p-5 text-center shadow-[0_10px_30px_-14px_color-mix(in_srgb,var(--brand-primary)_40%,transparent)] animate-slide-up">
            <p className="font-display text-xl font-bold text-primary">{client.reviewSettings.shareTitle}</p>
            <p className="mt-1 text-sm text-muted">{client.reviewSettings.shareSubtitle}</p>
          </div>
        )}

        <nav className="space-y-2.5" aria-label="Quick actions">
          {actions.map((a) => (
            <ActionRow key={a.path} href={href(a.path)} icon={a.icon} label={a.label} accent={a.accent} />
          ))}
        </nav>

        <p className="pt-2 text-center font-display text-lg italic text-primary-mid">
          {client.tagline} <span className="text-accent">♥</span>
        </p>
      </div>
    </div>
  );
}
