"use client";

import { useEffect } from "react";
import { useClient, useSession } from "./ClientProvider";
import { ensureCustomer } from "@/services/firebase/authService";
import { ensureCustomerToken, getCustomer } from "@/services/firebase/customerService";
import { subscribeLoyalty } from "@/services/firebase/loyaltyService";
import { trackEvent } from "@/services/firebase/analyticsService";
import { readLocalProfile } from "@/store/clientStore";
import { errorCode } from "@/services/firebase/diagnostics";
import { LOYALTY_COLLECTION } from "@/services/firebase/loyaltyService";

/**
 * Connects the customer session to Firebase for Firebase tenants:
 *   Anonymous Auth (UID restored on refresh) → customers/{uid} profile →
 *   QR token → live READ-ONLY listener on the canonical loyaltyAccounts/{uid}.
 * The customer can browse immediately; nothing here blocks the UI.
 * Bundled demo tenants keep their profile on this device and have no stamps.
 */
export function FirebaseSessionBridge() {
  const client = useClient();
  const hydrated = useSession((s) => s.hydrated);
  const syncAttempt = useSession((s) => s.syncAttempt);
  const tableNumber = useSession((s) => s.tableNumber);
  const setIdentity = useSession((s) => s.setIdentity);
  const setCustomerToken = useSession((s) => s.setCustomerToken);
  const setLoyalty = useSession((s) => s.setLoyalty);
  const setProfile = useSession((s) => s.setProfile);
  const patchDiag = useSession((s) => s.patchDiag);
  const { id: clientId, source, slug } = client;

  useEffect(() => {
    if (!hydrated) return;
    if (source !== "firebase") {
      patchDiag({ auth: { status: "skipped", code: "demo-tenant" } });
      const local = readLocalProfile(slug);
      setProfile(local, local ? "ready" : "missing");
      setLoyalty({ status: "local" });
      return;
    }
    let cancelled = false;
    let unsub: (() => void) | undefined;
    setLoyalty({ status: "connecting" });

    (async () => {
      let uid: string;
      try {
        uid = (await ensureCustomer()).uid;
        console.info("[diag] Anonymous Auth PASS · uid:", uid);
        patchDiag({ auth: { status: "pass" }, uid });
      } catch (e) {
        const code = (e as { code?: string })?.code ?? errorCode(e);
        patchDiag({ auth: { status: "fail", code }, loyalty: { status: "skipped", path: null, code: "no-auth" }, profile: { status: "skipped", path: null, code: "no-auth" } });
        if (!cancelled) {
          setLoyalty({ status: "unavailable" });
          setProfile(null, "unavailable");
        }
        return;
      }
      if (cancelled) return;
      setIdentity(uid);

      // Loyalty is read-only and independent of the profile document.
      const loyaltyPath = `${LOYALTY_COLLECTION}/${uid}`;
      console.info("[diag] Firestore loyalty listener →", loyaltyPath);
      patchDiag({ loyalty: { status: "pending", path: loyaltyPath }, profile: { status: "pending", path: `customers/${uid}` } });
      unsub = subscribeLoyalty(
        clientId,
        uid,
        (acc) => {
          if (cancelled) return;
          if (!acc.belongsToClient) console.warn("[loyalty] loyaltyAccounts doc belongs to another business; showing 0 here.");
          console.info(`[diag] Firestore loyalty read PASS · exists=${acc.exists} stamps=${acc.stamps}`);
          patchDiag({ loyalty: { status: "pass", path: loyaltyPath, exists: acc.exists, stamps: acc.stamps } });
          setLoyalty({ stamps: acc.stamps, rewardStatus: acc.status ?? null, status: "live" });
        },
        (e) => {
          const code = errorCode(e);
          console.warn(`[diag] Firestore loyalty read FAIL · ${code} · ${loyaltyPath}`);
          patchDiag({ loyalty: { status: "fail", path: loyaltyPath, code } });
          if (!cancelled) setLoyalty({ status: "unavailable" });
        }
      );

      try {
        const customer = await getCustomer(uid);
        patchDiag({ profile: { status: "pass", path: `customers/${uid}`, code: customer ? undefined : "no-profile-yet" } });
        if (cancelled) return;
        if (!customer) {
          setProfile(null, "missing");
          return;
        }
        setProfile({ name: customer.name, phone: customer.phone }, "ready");
        setCustomerToken(await ensureCustomerToken(customer));
        // Visits are NOT recorded here: opening/refreshing the app never counts as a
        // visit. The Staff App counts a visit when it completes a stamp operation.
      } catch (e) {
        const code = errorCode(e);
        console.warn(`[diag] Firestore profile read FAIL · ${code} · customers/${uid}`);
        patchDiag({ profile: { status: "fail", path: `customers/${uid}`, code } });
        if (!cancelled) setProfile(null, "unavailable");
      }
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [hydrated, source, clientId, slug, syncAttempt, setIdentity, setCustomerToken, setLoyalty, setProfile, patchDiag]);

  // QR_OPENED once per browser session per tenant.
  useEffect(() => {
    if (!hydrated || source !== "firebase") return;
    const key = `qrapp:${slug}:qrOpened`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* private mode */
    }
    trackEvent({ id: clientId, source }, "QR_OPENED", { tableId: tableNumber });
  }, [hydrated, source, slug, clientId, tableNumber]);

  return null;
}
