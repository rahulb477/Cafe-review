"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { MenuDrawer } from "./MenuDrawer";
import { BottomNav } from "./BottomNav";
import { OfflineBanner } from "./OfflineBanner";

interface UiCtx {
  openDrawer: () => void;
  closeDrawer: () => void;
}
const Ui = createContext<UiCtx>({ openDrawer: () => {}, closeDrawer: () => {} });
export const useUi = () => useContext(Ui);

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // The drawer is tied to the path it was opened on, so it closes on navigation.
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const drawerOpen = drawerPath === pathname;

  const hideNav = /^\/[^/]+\/review(\/|$)/.test(pathname);
  // Menu screens get a wider canvas on tablet/desktop for grid & two-column layouts.
  const wide = /^\/[^/]+\/menu(\/|$)/.test(pathname);
  const width = wide ? "max-w-[460px] md:max-w-[960px]" : "max-w-[460px]";

  return (
    <Ui.Provider value={{ openDrawer: () => setDrawerPath(pathname), closeDrawer: () => setDrawerPath(null) }}>
      <div className="flex min-h-[100dvh] w-full justify-center bg-backdrop">
        {/* overflow-x-clip (not hidden) so sticky headers keep working */}
        <div className={`relative flex min-h-[100dvh] w-full ${width} flex-col overflow-x-clip bg-canvas text-ink shadow-[0_0_60px_-10px_rgba(0,0,0,0.3)] transition-[max-width] duration-300`}>
          <OfflineBanner />
          <main className={`flex flex-1 flex-col ${hideNav ? "" : "pb-[calc(72px+var(--safe-bottom))]"}`}>{children}</main>
        </div>

        {/* Viewport-fixed layer aligned to the app column: bottom nav + drawer */}
        <div className="pointer-events-none fixed inset-0 z-40 flex justify-center">
          <div className={`relative h-full w-full ${width} transition-[max-width] duration-300`}>
            {!hideNav && <BottomNav />}
            <MenuDrawer open={drawerOpen} onClose={() => setDrawerPath(null)} />
          </div>
        </div>
      </div>
    </Ui.Provider>
  );
}
