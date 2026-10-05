"use client";

import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { useClient, useSession } from "@/components/ClientProvider";
import { ProfileSettings } from "@/components/customer/ProfileSettings";

export default function SettingsPage() {
  const client = useClient();
  const tableNumber = useSession((s) => s.tableNumber);
  const location = useSession((s) => s.location);
  const resetReview = useSession((s) => s.resetReview);
  const setQrContext = useSession((s) => s.setQrContext);

  const rows = [
    { label: "Visiting", value: client.businessName },
    { label: "Table", value: tableNumber ?? "Not set" },
    { label: "Location", value: location ?? "Not set" },
  ];

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader title="Settings" backPath="/" />
      <div className="px-5 pt-4 animate-fade-in">
        <section className="rounded-3xl bg-surface p-2 shadow-[0_8px_30px_-16px_color-mix(in_srgb,var(--brand-primary)_40%,transparent)]">
          {rows.map((r, i) => (
            <div key={r.label} className={`flex items-center justify-between px-3 py-3.5 ${i !== rows.length - 1 ? "border-b border-primary/10" : ""}`}>
              <span className="text-sm text-muted">{r.label}</span>
              <span className="max-w-[60%] truncate text-sm font-semibold text-primary">{r.value}</span>
            </div>
          ))}
        </section>
        <ProfileSettings />
        <h2 className="mb-2 mt-6 px-1 text-sm font-semibold text-muted">Manage</h2>
        <div className="space-y-3 pb-6">
          <Button variant="secondary" full onClick={() => resetReview()}>
            Clear my review answers
          </Button>
          <Button variant="secondary" full onClick={() => setQrContext({ tableNumber: null, location: null })}>
            Clear table / location
          </Button>
        </div>
        <p className="px-1 text-[11px] leading-relaxed text-muted">Your review answers stay on this device. Your name, mobile number and stamps are kept privately by the café.</p>
      </div>
    </div>
  );
}
