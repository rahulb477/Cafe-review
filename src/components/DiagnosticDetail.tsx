"use client";

import { useSyncExternalStore } from "react";
import { useSession } from "./ClientProvider";
import { isDiagnosticMode } from "@/services/firebase/diagnostics";

const subscribe = () => () => {};

/**
 * Exact failure category under existing error states — diagnostic mode only
 * (dev, NEXT_PUBLIC_DIAGNOSTICS=true, or ?diag=1). Customers never see it.
 */
export function DiagnosticDetail({ className = "" }: { className?: string }) {
  const on = useSyncExternalStore(subscribe, isDiagnosticMode, () => false);
  const d = useSession((s) => s.diag);
  if (!on) return null;
  const row = (label: string, status: string, extra?: string) => `${label}: ${status.toUpperCase()}${extra ? ` · ${extra}` : ""}`;
  const lines = [
    row("Firebase init", d.init.status, `${d.init.projectId} · key ${d.init.apiKeyHint}${d.init.code ? ` · ${d.init.code}` : ""}`),
    row("Anonymous Auth", d.auth.status, d.auth.code),
    row("Firebase UID", d.uid ? "pass" : "fail", d.uid ?? undefined),
    row("Loyalty read", d.loyalty.status, [d.loyalty.path, d.loyalty.code, d.loyalty.exists === false ? "doc not created yet" : undefined].filter(Boolean).join(" · ")),
    row("Profile read", d.profile.status, [d.profile.path, d.profile.code].filter(Boolean).join(" · ")),
  ];
  return (
    <pre data-testid="firebase-diagnostics" className={`mt-3 w-full overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-black/80 p-3 text-left font-mono text-[10px] leading-relaxed text-emerald-200 ${className}`}>
      {lines.join("\n")}
    </pre>
  );
}
