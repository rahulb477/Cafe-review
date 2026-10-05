"use client";

import { useEffect, useState } from "react";
import { trackEvent } from "@/services/firebase/analyticsService";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { StatusScreen } from "@/components/StatusScreen";
import { Wifi, ArrowRight, Check } from "@/components/icons";
import { useClient, useClientHref } from "@/components/ClientProvider";
import { getWifiInfo, requestWifiJoin } from "@/services/wifiService";

export default function WifiPage() {
  const client = useClient();
  const href = useClientHref();
  const info = getWifiInfo(client);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (info.enabled) trackEvent(client, "WIFI_VIEWED");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per visit
  }, [client.id, info.enabled]);

  if (!info.enabled) {
    return (
      <div className="flex min-h-full flex-col">
        <ScreenHeader title="Wi-Fi" backPath="/" />
        <StatusScreen emoji="📶" title="Wi-Fi not available" message={`${client.businessName} doesn't offer guest Wi-Fi through this app.`} action={{ label: "Back to Home", href: href("/") }} />
      </div>
    );
  }

  const connect = async () => {
    setStatus("loading");
    const res = await requestWifiJoin(client.slug);
    setMessage(res.message);
    setStatus(res.ok ? "done" : "error");
  };

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader title="Wi-Fi" backPath="/" />
      <div className="flex flex-1 flex-col items-center px-6 pt-8 text-center animate-fade-in">
        <span className="grid h-28 w-28 place-items-center rounded-full bg-emerald-50 text-emerald-500">
          <Wifi width={64} height={64} />
        </span>
        <h1 className="mt-6 font-display text-3xl font-bold leading-tight text-primary">
          Connect to Our
          <br />
          Free Wi-Fi
        </h1>
        <p className="mt-2 max-w-xs text-sm text-muted">{info.hint}</p>
        <div className="mt-8 flex w-full items-center gap-3 rounded-2xl bg-secondary px-5 py-4">
          <Wifi width={22} height={22} className="text-emerald-600" />
          <div className="min-w-0 text-left">
            <p className="text-[11px] uppercase tracking-wider text-muted">Network</p>
            <p className="truncate text-lg font-bold tracking-wide text-primary">{info.ssid}</p>
          </div>
        </div>
        {status === "done" && (
          <div role="status" className="mt-4 flex w-full items-start gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-left text-sm text-emerald-700 animate-fade-in">
            <Check width={18} height={18} className="mt-0.5 shrink-0" />
            <span>{message}</span>
          </div>
        )}
        {status === "error" && (
          <p role="alert" className="mt-4 w-full rounded-2xl bg-amber-50 px-4 py-3 text-left text-sm text-amber-700">
            {message}
          </p>
        )}
        <div className="mt-auto w-full pb-10 pt-8">
          <Button full size="lg" onClick={connect} disabled={status === "loading"}>
            {status === "loading" ? "Connecting…" : "Connect Now"}
            {status !== "loading" && <ArrowRight width={18} height={18} />}
          </Button>
        </div>
      </div>
    </div>
  );
}
