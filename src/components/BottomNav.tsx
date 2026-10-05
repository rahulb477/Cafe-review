"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Utensils, QrIcon, Heart, MenuIcon } from "./icons";
import { useUi } from "./AppShell";
import { useClient, useClientHref } from "./ClientProvider";

export function BottomNav() {
  const pathname = usePathname();
  const { openDrawer } = useUi();
  const client = useClient();
  const href = useClientHref();

  const items = [
    { path: "/", label: "Home", icon: Home },
    { path: "/menu", label: "Menu", icon: Utensils },
    ...(client.loyalty.enabled
      ? [
          { path: "/qr", label: "My QR", icon: QrIcon },
          { path: "/stamps", label: "Stamps", icon: Heart },
        ]
      : []),
  ];

  return (
    <nav
      aria-label="Primary"
      className="pointer-events-auto absolute bottom-0 left-0 right-0 z-30 border-t border-primary/10 bg-surface/95 backdrop-blur-md"
      style={{ paddingBottom: "var(--safe-bottom)" }}
    >
      <ul className="grid h-[64px]" style={{ gridTemplateColumns: `repeat(${items.length + 1}, minmax(0, 1fr))` }}>
        {items.map(({ path, label, icon: Icon }) => {
          const to = href(path);
          const active = pathname === to;
          return (
            <li key={path}>
              <Link
                href={to}
                aria-current={active ? "page" : undefined}
                className={`press flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium ${active ? "text-primary" : "text-muted"}`}
              >
                <Icon width={22} height={22} className={active ? "" : "opacity-70"} />
                {label}
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={openDrawer}
            aria-label="Open menu"
            className="press flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted"
          >
            <MenuIcon width={22} height={22} className="opacity-70" />
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}
