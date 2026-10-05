"use client";

import Image from "next/image";
import { useState } from "react";
import { useClient } from "./ClientProvider";

/** Client logo badge + wordmark. Falls back to an initials badge if the logo is missing or fails. */
export function ClientLogo({ size = "md", light = false }: { size?: "sm" | "md" | "lg"; light?: boolean }) {
  const client = useClient();
  const [failed, setFailed] = useState(false);
  const dims = {
    sm: { px: 36, name: "text-lg", sub: "text-[8px]" },
    md: { px: 48, name: "text-2xl", sub: "text-[9px]" },
    lg: { px: 64, name: "text-4xl", sub: "text-[11px]" },
  }[size];
  const initials = client.displayName.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col items-center gap-1.5">
      {client.logo && !failed ? (
        <Image
          src={client.logo}
          alt={`${client.businessName} logo`}
          width={dims.px}
          height={dims.px}
          className="drop-shadow-md"
          onError={() => setFailed(true)}
          unoptimized={client.logo.endsWith(".svg") || /^https?:\/\//i.test(client.logo)}
        />
      ) : (
        <span
          style={{ width: dims.px, height: dims.px }}
          className={`grid place-items-center rounded-full font-display font-bold ${light ? "bg-canvas/15 text-canvas" : "bg-primary text-canvas"}`}
          aria-label={`${client.businessName} logo`}
        >
          {initials}
        </span>
      )}
      <div className="flex flex-col items-center leading-none">
        <span className={`font-display font-bold tracking-[0.1em] ${dims.name} ${light ? "text-canvas" : "text-primary"}`}>
          {client.displayName}
        </span>
        {client.displaySubtitle && (
          <span className={`${dims.sub} mt-0.5 tracking-[0.35em] ${light ? "text-canvas/75" : "text-muted"}`}>{client.displaySubtitle}</span>
        )}
      </div>
    </div>
  );
}
