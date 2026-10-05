"use client";

import type { ReactNode } from "react";
import { useClient, useSession } from "@/components/ClientProvider";
import { Heart } from "@/components/icons";
import { ProfileForm } from "./ProfileForm";
import { DiagnosticDetail } from "@/components/DiagnosticDetail";

/**
 * Shown before identity-dependent features (My QR, My Stamps). Browsing the
 * rest of the app never requires it. Existing customers pass straight through.
 */
export function ProfileGate({ children }: { children: ReactNode }) {
  const client = useClient();
  const hydrated = useSession((s) => s.hydrated);
  const status = useSession((s) => s.profileStatus);
  const retry = useSession((s) => s.retrySync);

  if (status === "ready") return <>{children}</>;

  if (!hydrated || status === "idle" || status === "loading") {
    return (
      <div className="flex flex-1 flex-col items-center px-6 pt-10" aria-busy="true" aria-label="Loading your loyalty">
        <div className="skeleton h-16 w-16 rounded-full" />
        <div className="skeleton mt-5 h-6 w-48 rounded-lg" />
        <div className="skeleton mt-3 h-4 w-64 rounded-lg" />
        <div className="skeleton mt-8 h-12 w-full max-w-sm rounded-2xl" />
        <div className="skeleton mt-4 h-12 w-full max-w-sm rounded-2xl" />
      </div>
    );
  }

  if (status === "unavailable") {
    return (
      <div role="alert" className="flex flex-1 flex-col items-center justify-center px-8 py-12 text-center animate-fade-in">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-secondary text-primary">
          <Heart width={30} height={30} />
        </span>
        <h1 className="mt-5 font-display text-2xl font-bold text-primary">Loyalty unavailable</h1>
        <p className="mt-2 max-w-xs text-sm text-muted">We couldn&apos;t connect to the loyalty service right now. You can keep browsing and try again shortly.</p>
        <button onClick={retry} className="press mt-8 inline-flex h-12 items-center rounded-2xl bg-button px-7 font-semibold text-canvas shadow-md shadow-primary/20">
          Try again
        </button>
        <div className="w-full max-w-sm">
          <DiagnosticDetail />
        </div>
      </div>
    );
  }

  // status === "missing"
  return (
    <div className="flex flex-1 flex-col items-center px-6 pb-8 pt-4 animate-fade-in">
      <span className="grid h-16 w-16 place-items-center rounded-full bg-accent/15 text-accent">
        <Heart filled width={30} height={30} />
      </span>
      <h1 className="mt-5 text-center font-display text-2xl font-bold text-primary">Let&apos;s save your loyalty</h1>
      <p className="mt-2 max-w-xs text-center text-sm text-muted">
        Add your name and mobile number so {client.businessName} can add stamps to your card.
      </p>
      <div className="mt-6 w-full max-w-sm rounded-3xl bg-surface p-5 shadow-card">
        <ProfileForm />
      </div>
    </div>
  );
}
