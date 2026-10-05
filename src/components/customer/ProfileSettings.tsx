"use client";

import { useState } from "react";
import { useClient, useSession } from "@/components/ClientProvider";
import { formatIndianMobile } from "@/lib/customerValidation";
import { ProfileForm } from "./ProfileForm";

/** "Your details" block in Settings — view and edit name + mobile. */
export function ProfileSettings() {
  const client = useClient();
  const profile = useSession((s) => s.profile);
  const status = useSession((s) => s.profileStatus);
  const [editing, setEditing] = useState(false);

  if (!client.loyalty.enabled) return null;

  return (
    <>
      <h2 className="mb-2 mt-6 px-1 text-sm font-semibold text-muted">Your details</h2>
      <section className="rounded-3xl bg-surface p-4 shadow-card">
        {editing || status === "missing" ? (
          <ProfileForm mode={profile ? "edit" : "create"} onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} />
        ) : status === "ready" && profile ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-primary">{profile.name}</p>
              <p className="text-sm text-muted">{formatIndianMobile(profile.phone)}</p>
            </div>
            <button onClick={() => setEditing(true)} className="press h-10 shrink-0 rounded-xl bg-secondary px-4 text-sm font-semibold text-primary">
              Edit
            </button>
          </div>
        ) : status === "unavailable" ? (
          <p className="text-sm text-muted">Your details can&apos;t be loaded right now. Please try again later.</p>
        ) : (
          <div className="space-y-2" aria-busy="true">
            <div className="skeleton h-4 w-32 rounded" />
            <div className="skeleton h-4 w-40 rounded" />
          </div>
        )}
      </section>
    </>
  );
}
