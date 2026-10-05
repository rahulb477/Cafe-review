"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "./ClientProvider";
import { parseQrParams } from "@/services/qrService";

function Reader() {
  const params = useSearchParams();
  const setQrContext = useSession((s) => s.setQrContext);

  useEffect(() => {
    const { table, location } = parseQrParams(params);
    if (table || location) {
      setQrContext({ tableNumber: table ?? undefined, location: location ?? undefined });
    }
  }, [params, setQrContext]);

  return null;
}

/** Captures ?table= / ?location= from the scanned QR into the client's session. */
export function QrCapture() {
  return (
    <Suspense fallback={null}>
      <Reader />
    </Suspense>
  );
}
