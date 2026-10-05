"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, MenuIcon } from "./icons";
import { useUi } from "./AppShell";
import { useClientHref } from "./ClientProvider";

interface Props {
  title?: string;
  /** Client-relative back path, e.g. "/" or "/review/items". */
  backPath?: string;
  showMenu?: boolean;
}

export function ScreenHeader({ title, backPath, showMenu = true }: Props) {
  const router = useRouter();
  const href = useClientHref();
  const { openDrawer } = useUi();
  const btn = "press grid h-10 w-10 place-items-center rounded-full bg-secondary text-primary";

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between bg-canvas/90 px-3 py-3 backdrop-blur-md" style={{ paddingTop: "calc(var(--safe-top) + 0.5rem)" }}>
      <button onClick={() => (backPath !== undefined ? router.push(href(backPath)) : router.back())} aria-label="Go back" className={btn}>
        <ChevronLeft />
      </button>
      {title && <h1 className="font-display text-lg font-bold tracking-tight text-primary">{title}</h1>}
      {showMenu ? (
        <button onClick={openDrawer} aria-label="Open menu" className={btn}>
          <MenuIcon />
        </button>
      ) : (
        <span className="h-10 w-10" />
      )}
    </header>
  );
}
