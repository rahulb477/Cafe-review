"use client";

import { useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { StatusScreen } from "@/components/StatusScreen";
import { LoyaltySyncNotice } from "@/components/LoyaltySyncNotice";
import { ProfileGate } from "@/components/customer/ProfileGate";
import { useClient, useClientHref, useSession } from "@/components/ClientProvider";
import { generateCustomerQR } from "@/services/qrService";
import { loyaltyService } from "@/services/loyaltyService";
import { trackEvent } from "@/services/firebase/analyticsService";

export default function QrPage() {
  const client = useClient();
  const href = useClientHref();
  const hydrated = useSession((s) => s.hydrated);
  const localId = useSession((s) => s.customerId);
  const token = useSession((s) => s.customerToken);
  const status = useSession((s) => s.loyaltyStatus);
  const retry = useSession((s) => s.retrySync);
  const stamps = useSession((s) => s.stamps);
  const { loyalty } = client;

  useEffect(() => {
    if (loyalty.enabled) trackEvent(client, "LOYALTY_VIEWED");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per visit
  }, [client.id, loyalty.enabled]);

  if (!loyalty.enabled) {
    return (
      <div className="flex min-h-full flex-col">
        <ScreenHeader title="My QR Code" backPath="/" />
        <StatusScreen
          emoji="🎟️"
          title="No loyalty program"
          message={`${client.businessName} doesn't run a stamp card right now.`}
          action={{ label: "Back to Home", href: href("/") }}
        />
      </div>
    );
  }

  // Firebase tenants: opaque token resolvable by the Staff App (no personal data).
  // Demo tenants: local device id.
  const isFirebase = client.source === "firebase";
  let value: string | null = null;
  try {
    value = !hydrated ? null : isFirebase ? (token ? generateCustomerQR(client.slug, token) : null) : localId ? generateCustomerQR(client.slug, localId) : null;
  } catch {
    value = null;
  }
  const failed = isFirebase && status === "unavailable" && !token;

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader title="My QR Code" backPath="/" />
      <ProfileGate>
        <div className="flex flex-1 flex-col items-center px-6 pt-4 animate-fade-in">
          <div className="relative w-full max-w-xs rounded-3xl bg-surface p-6 shadow-card">
            <div className="relative mx-auto grid aspect-square w-full max-w-[240px] place-items-center rounded-2xl bg-white p-3">
              {value ? (
                <QRCodeSVG
                  value={value}
                  size={220}
                  level="H"
                  marginSize={1}
                  className="h-full w-full"
                  fgColor={client.theme.primaryDark}
                  bgColor="#ffffff"
                  title={`${client.businessName} loyalty QR code`}
                  imageSettings={client.logo ? { src: client.logo, height: 44, width: 44, excavate: true } : undefined}
                />
              ) : failed ? (
                <div role="alert" className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-xl bg-secondary p-4 text-center">
                  <span className="text-3xl" aria-hidden>
                    📡
                  </span>
                  <p className="text-sm font-semibold text-primary">QR unavailable right now</p>
                  <button onClick={retry} className="press rounded-xl bg-button px-4 py-2 text-sm font-semibold text-canvas">
                    Try again
                  </button>
                </div>
              ) : (
                <div className="skeleton grid h-full w-full place-items-center rounded-xl">
                  <span className="relative z-10 text-xs font-medium text-muted">Generating QR…</span>
                </div>
              )}
            </div>
          </div>
          <p className="mt-5 max-w-xs text-center text-sm text-muted">Show this QR code to staff to earn your stamp.</p>
          <div className="mt-6 w-full max-w-xs rounded-2xl bg-primary px-5 py-4 text-canvas">
            <p className="text-center font-display text-lg font-bold" aria-live="polite">
              {loyaltyService.capped(stamps, loyalty)} / {loyalty.stampTarget} stamps
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
              {Array.from({ length: loyalty.stampTarget }, (_, i) => (
                <span key={i} className={`h-4 w-4 rounded-full border transition-colors ${i < stamps ? "border-accent bg-accent" : "border-canvas/40"}`} />
              ))}
            </div>
          </div>
          <div className="w-full max-w-xs">
            <LoyaltySyncNotice />
          </div>
        </div>
      </ProfileGate>
      <div className="h-6" />
    </div>
  );
}
