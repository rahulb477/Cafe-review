"use client";

import Link from "next/link";
import { Close } from "./icons";
import { ClientLogo } from "./ClientLogo";
import { useClientHref } from "./ClientProvider";
import { useNavItems } from "./useNavItems";

export function MenuDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const href = useClientHref();
  const links = useNavItems({ includeHome: true, includeSettings: true });

  return (
    <div className={`absolute inset-0 z-50 ${open ? "pointer-events-auto" : "pointer-events-none"}`} aria-hidden={!open} inert={!open}>
      <div onClick={onClose} className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`} />
      <aside
        role="dialog"
        aria-label="Navigation menu"
        className={`absolute right-0 top-0 flex h-full w-[82%] max-w-[340px] flex-col bg-canvas transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}
        style={{ paddingBottom: "var(--safe-bottom)" }}
      >
        <div className="relative bg-primary-dark px-5 pb-5 pt-6" style={{ paddingTop: "calc(var(--safe-top) + 1.5rem)" }}>
          <ClientLogo size="sm" light />
          <button onClick={onClose} aria-label="Close menu" className="press absolute right-3 top-3 p-1 text-canvas" style={{ top: "calc(var(--safe-top) + 0.75rem)" }}>
            <Close />
          </button>
        </div>
        <nav className="no-scrollbar flex-1 overflow-y-auto py-2">
          <ul>
            {links.map(({ path, label, icon }) => (
              <li key={path}>
                <Link href={href(path)} onClick={onClose} className="press flex items-center gap-4 px-6 py-3.5 text-[15px] font-medium text-primary hover:bg-primary/5">
                  <span className="grid w-6 place-items-center text-primary-mid">{icon}</span>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </div>
  );
}
