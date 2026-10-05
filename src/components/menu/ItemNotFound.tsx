"use client";

import Link from "next/link";
import { useClient, useClientHref } from "@/components/ClientProvider";
import { ScreenHeader } from "@/components/ScreenHeader";

export function ItemNotFound() {
  const client = useClient();
  const href = useClientHref();
  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader title="Our Menu" backPath="/menu" />
      <div role="alert" className="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center animate-fade-in">
        <span className="grid h-24 w-24 place-items-center rounded-full bg-secondary text-5xl shadow-card" aria-hidden>
          🍽️
        </span>
        <h1 className="mt-6 font-display text-2xl font-bold text-primary">Item Not Found</h1>
        <p className="mt-2 max-w-xs text-sm text-muted">
          This dish isn&apos;t on the {client.businessName} menu right now. Take a look at what&apos;s fresh today.
        </p>
        <Link href={href("/menu")} className="press mt-8 inline-flex h-12 items-center rounded-2xl bg-button px-7 font-semibold text-canvas shadow-md shadow-primary/20 hover:bg-primary-dark">
          Back to Menu
        </Link>
      </div>
    </div>
  );
}
