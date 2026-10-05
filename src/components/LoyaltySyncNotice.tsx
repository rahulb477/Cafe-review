"use client";

import { useSession } from "./ClientProvider";
import { DiagnosticDetail } from "./DiagnosticDetail";

/** Small inline status for the live (read-only) loyalty sync. */
export function LoyaltySyncNotice() {
  const status = useSession((s) => s.loyaltyStatus);
  const retry = useSession((s) => s.retrySync);
  if (status === "live" || status === "idle" || status === "local") return null;
  if (status === "connecting")
    return (
      <p role="status" className="mt-3 flex items-center justify-center gap-2 text-xs text-muted">
        <span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> Syncing your stamps…
      </p>
    );
  return (
    <>
      <div role="alert" className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-left text-sm text-amber-800">
        <span>We couldn&apos;t reach the loyalty service. Your stamps are safe.</span>
        <button onClick={retry} className="press shrink-0 rounded-xl bg-amber-100 px-3 py-1.5 font-semibold">
          Retry
        </button>
      </div>
      <DiagnosticDetail />
    </>
  );
}
