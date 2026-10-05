"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useClient, useSession } from "@/components/ClientProvider";
import { ensureCustomer } from "@/services/firebase/authService";
import { saveCustomerProfile } from "@/services/firebase/customerService";
import { setRegistrationLogger } from "@/services/firebase/customerProfileWrites";
import { isDiagnosticMode } from "@/services/firebase/diagnostics";
import { localMobilePart, normalizeIndianMobile, normalizeName, validateMobile, validateName } from "@/lib/customerValidation";

const input =
  "mt-2 h-12 w-full rounded-2xl border-2 border-primary/15 bg-surface px-4 text-[15px] text-primary placeholder:text-primary/35 focus:border-primary/40 focus:outline-none aria-[invalid=true]:border-red-400";

/**
 * Name + mobile form. Saves to customers/{uid} (Firebase tenants) using the
 * current tenant's server-resolved clientId — the customer never chooses it.
 */
export function ProfileForm({ mode = "create", onSaved, onCancel }: { mode?: "create" | "edit"; onSaved?: () => void; onCancel?: () => void }) {
  const client = useClient();
  const profile = useSession((s) => s.profile);
  const setProfile = useSession((s) => s.setProfile);
  const setIdentity = useSession((s) => s.setIdentity);
  const setCustomerToken = useSession((s) => s.setCustomerToken);
  const saveLocalProfile = useSession((s) => s.saveLocalProfile);
  const id = useId();

  const [name, setName] = useState(profile?.name ?? "");
  const [phone, setPhone] = useState(profile ? localMobilePart(profile.phone) : "");
  const [touched, setTouched] = useState({ name: false, phone: false });
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  /** Server-side rejection for the phone field (e.g. number already registered). */
  const [phoneTaken, setPhoneTaken] = useState<string | null>(null);

  const nameError = validateName(name);
  const phoneError = validateMobile(phone);

  const submit = async (e: React.FormEvent) => {
    // ?diag=1: log unmasked technical details (clientId, normalized phone, index path, code).
    if (isDiagnosticMode()) setRegistrationLogger((d) => console.info("[diag] registration", JSON.stringify(d)));
    e.preventDefault();
    if (status === "saving") return;
    setTouched({ name: true, phone: true });
    if (nameError || phoneError) return;
    const next = { name: normalizeName(name), phone: normalizeIndianMobile(phone)! };
    setStatus("saving");
    setError(null);
    try {
      if (client.source !== "firebase") {
        saveLocalProfile(next);
      } else {
        const user = await ensureCustomer();
        setIdentity(user.uid);
        const result = await saveCustomerProfile(user.uid, client.id, next);
        if (result.status === "PHONE_ALREADY_REGISTERED") {
          // Nothing was written; no details of the other customer are revealed.
          setPhoneTaken("This number is already registered.");
          setStatus("idle");
          return;
        }
        if (result.status === "TEMPORARILY_UNAVAILABLE") {
          setStatus("error");
          setError("We couldn't reach the server. Please check your connection and try again.");
          return;
        }
        if (result.qrToken) setCustomerToken(result.qrToken);
        setProfile(next, "ready");
      }
      setStatus("idle");
      onSaved?.();
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      console.warn("[profile] save failed:", code || (err as Error)?.message);
      setStatus("error");
      setError(
        /api-key|auth\/|firebase-disabled/.test(code + (err as Error)?.message)
          ? "Loyalty is temporarily unavailable. Please try again in a moment."
          : "We couldn't save your details. Please check your connection and try again."
      );
    }
  };

  const showName = touched.name && nameError;
  const showPhone = (touched.phone && phoneError) || phoneTaken;

  return (
    <form onSubmit={submit} noValidate className="w-full text-left">
      <label htmlFor={`${id}-name`} className="block text-sm font-semibold text-primary">
        Name
      </label>
      <input
        id={`${id}-name`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => setTouched((t) => ({ ...t, name: true }))}
        autoComplete="name"
        maxLength={60}
        placeholder="Your name"
        aria-invalid={!!showName}
        aria-describedby={showName ? `${id}-name-err` : undefined}
        className={input}
      />
      {showName && (
        <p id={`${id}-name-err`} className="mt-1.5 px-1 text-xs text-red-600">
          {nameError}
        </p>
      )}

      <label htmlFor={`${id}-phone`} className="mt-4 block text-sm font-semibold text-primary">
        Mobile Number
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 mt-1 -translate-y-1/2 text-[15px] font-medium text-muted" aria-hidden>
          +91
        </span>
        <input
          id={`${id}-phone`}
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value.replace(/[^\d+\s-]/g, "").slice(0, 16));
            if (phoneTaken) setPhoneTaken(null);
          }}
          onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="98765 43210"
          aria-invalid={!!showPhone}
          aria-describedby={`${id}-phone-help`}
          className={`${input} pl-14`}
        />
      </div>
      <p id={`${id}-phone-help`} role={phoneTaken ? "alert" : undefined} className={`mt-1.5 px-1 text-xs ${showPhone ? "text-red-600" : "text-muted"}`}>
        {showPhone ? (phoneTaken ?? phoneError) : "Only used by the café for your loyalty card. Never shown publicly."}
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className={`mt-6 flex gap-3 ${mode === "edit" ? "" : "flex-col"}`}>
        {mode === "edit" && onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={status === "saving"}>
            Cancel
          </Button>
        )}
        <Button full size="lg" type="submit" disabled={status === "saving"} aria-busy={status === "saving"}>
          {status === "saving" ? "Saving…" : status === "error" ? "Try Again" : mode === "edit" ? "Save" : "Continue"}
        </Button>
      </div>
    </form>
  );
}
