"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ScreenHeader } from "@/components/ScreenHeader";
import { MenuItemCard, MenuItemCardSkeleton } from "@/components/MenuItemCard";
import { StatusScreen } from "@/components/StatusScreen";
import { useClient, useClientHref } from "@/components/ClientProvider";
import { getMenu, getCategories, getItemSlug } from "@/services/menuService";
import type { ClientConfig } from "@/types/client";
import type { MenuItem } from "@/types/menu";
import { trackEvent } from "@/services/firebase/analyticsService";
import { Utensils } from "@/components/icons";

/** Used only when the tenant has no description in Firebase. */
const INTRO_FALLBACK = "Small-batch favourites, made with a little more care.";

export default function MenuPage() {
  const client = useClient();

  return (
    <div className="flex flex-col">
      {/* Existing customer app header (back + drawer), unchanged. */}
      <ScreenHeader backPath="/" />

      {/* Editorial intro — rendered from the tenant config, no hardcoded branding. */}
      <header className="px-5 pb-7 pt-2 md:px-6 md:pb-9">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.24em] text-muted">Fresh from the counter</p>
        <h1 className="mt-3 font-display text-[2.15rem] font-normal leading-[1.05] tracking-tight text-primary md:text-[2.75rem]">Our menu</h1>
        <p className="mt-3 max-w-md text-[13.5px] leading-relaxed text-muted">{client.description?.trim() || INTRO_FALLBACK}</p>
      </header>

      <Suspense fallback={<MenuBodySkeleton />}>
        <MenuContent />
      </Suspense>
    </div>
  );
}

/** Loading state in the exact shape of the menu: pills + editorial cards. */
function MenuBodySkeleton() {
  return (
    <>
      <div className="sticky z-10 border-b border-primary/10 bg-canvas/95 backdrop-blur-md" style={{ top: "calc(var(--safe-top) + 60px)" }}>
        <div className="flex gap-2 overflow-hidden px-4 py-3 md:px-6" aria-hidden>
          {[52, 74, 88, 62, 66].map((w, i) => (
            <div key={i} className="skeleton h-9 shrink-0 rounded-full" style={{ width: w }} />
          ))}
        </div>
      </div>
      <div className="px-4 pb-4 pt-5 md:px-6 md:pt-6" role="status">
        <span className="sr-only">Loading menu</span>
        <div className="grid gap-3.5 sm:grid-cols-2 md:gap-5 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <MenuItemCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </>
  );
}

function MenuContent() {
  const client = useClient();
  const href = useClientHref();
  const pathname = usePathname();
  const params = useSearchParams();
  const categories = useMemo(() => getCategories(client), [client]);

  const requested = params.get("category");
  const active = requested && categories.includes(requested) ? requested : "All";

  const [items, setItems] = useState<MenuItem[] | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    trackEvent(client, "MENU_VIEWED", { tableId: params.get("table") });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per visit
  }, [client.id]);

  useEffect(() => {
    let cancelled = false;
    getMenu(client)
      .then((data) => !cancelled && setItems(data))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [client, reloadKey]);

  // Category lives in the URL so Back from a detail page restores it.
  // Native replaceState is synced with useSearchParams by Next.js (no refetch).
  const select = useCallback(
    (cat: string) => {
      const url = cat === "All" ? pathname : `${pathname}?category=${encodeURIComponent(cat)}`;
      window.history.replaceState(null, "", url);
    },
    [pathname]
  );

  const filtered = useMemo(() => (!items ? [] : active === "All" ? items : items.filter((i) => i.category === active)), [items, active]);

  return (
    <>
      <CategoryBar categories={categories} active={active} onSelect={select} />

      <div className="px-4 pb-4 pt-5 md:px-6 md:pt-6">
        {!items && !error && (
          <div role="status">
            <span className="sr-only">Loading menu</span>
            <div className="grid gap-3.5 sm:grid-cols-2 md:gap-5 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <MenuItemCardSkeleton key={i} />
              ))}
            </div>
          </div>
        )}

        {error && (
          <StatusScreen
            emoji="😕"
            title="Menu unavailable"
            message="We couldn't load the menu right now. Please check your connection and try again."
            action={{
              label: "Retry",
              onClick: () => {
                setError(false);
                setReloadKey((k) => k + 1);
              },
            }}
          />
        )}

        {items && (
          <>
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.24em] text-muted">{active === "All" ? "The full menu" : active}</h2>
              <span className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted" aria-live="polite">
                {filtered.length} {filtered.length === 1 ? "item" : "items"}
              </span>
            </div>

            {filtered.length > 0 ? (
              <div key={active} className="grid gap-3.5 sm:grid-cols-2 md:gap-5 lg:grid-cols-3">
                {filtered.map((item, i) => {
                  const slug = getItemSlug(item);
                  const to = href(`/menu/${slug}`) + (active !== "All" ? `?from=${encodeURIComponent(active)}` : "");
                  return <MenuItemCard key={item.id} item={item} currency={client.currency} href={to} index={i} />;
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center rounded-xl border border-primary/10 bg-surface px-6 py-14 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-full border border-primary/10 text-primary/40" aria-hidden>
                  <Utensils width={20} height={20} />
                </span>
                <p className="mt-4 font-display text-lg text-primary">Nothing here yet</p>
                <p className="mt-1.5 max-w-xs text-[13px] leading-relaxed text-muted">
                  {active === "All" ? "Our menu is being updated — please check back in a moment." : `We're still plating up our ${active} selection — try another category in the meantime.`}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

/**
 * Horizontal category selector: dark filled pill for the active category,
 * cream bordered pills for the rest. Scrolls on mobile (scrollbar hidden),
 * keeps tab semantics + arrow-key navigation, and the active chip in view.
 */
function CategoryBar({ categories, active, onSelect }: { categories: string[]; active: string; onSelect: (c: string) => void }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const chipRefs = useRef(new Map<string, HTMLButtonElement>());
  const firstRun = useRef(true);

  // Position the sliding pill and keep the active chip in view (DOM-only, no state).
  useLayoutEffect(() => {
    const place = () => {
      const el = chipRefs.current.get(active);
      const ind = indicatorRef.current;
      if (!el || !ind) return;
      ind.style.width = `${el.offsetWidth}px`;
      ind.style.transform = `translateX(${el.offsetLeft}px)`;
      ind.style.opacity = "1";
    };
    place();
    const el = chipRefs.current.get(active);
    const scroller = scrollerRef.current;
    if (el && scroller) {
      scroller.scrollTo({
        left: el.offsetLeft - (scroller.clientWidth - el.offsetWidth) / 2,
        behavior: firstRun.current ? "auto" : "smooth",
      });
    }
    firstRun.current = false;
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [active, categories]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = categories.indexOf(active);
    const next = categories[(i + (e.key === "ArrowRight" ? 1 : -1) + categories.length) % categories.length];
    onSelect(next);
    chipRefs.current.get(next)?.focus();
  };

  return (
    <div className="sticky z-10 border-b border-primary/10 bg-canvas/95 backdrop-blur-md" style={{ top: "calc(var(--safe-top) + 60px)" }}>
      <div
        ref={scrollerRef}
        className="no-scrollbar overflow-x-auto [mask-image:linear-gradient(to_right,transparent,black_14px,black_calc(100%-14px),transparent)]"
      >
        <div role="tablist" aria-label="Menu categories" onKeyDown={onKeyDown} className="relative flex w-max gap-2 px-4 py-3 md:px-6">
          <span
            ref={indicatorRef}
            aria-hidden
            className="absolute bottom-3 left-0 top-3 rounded-full bg-primary opacity-0 transition-[transform,width] duration-300 ease-out"
          />
          {categories.map((cat) => {
            const isActive = cat === active;
            return (
              <button
                key={cat}
                ref={(el) => {
                  if (el) chipRefs.current.set(cat, el);
                  else chipRefs.current.delete(cat);
                }}
                role="tab"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                onClick={() => onSelect(cat)}
                className={`press relative z-10 h-9 shrink-0 whitespace-nowrap rounded-full px-4 text-[13px] transition-colors duration-300 ${
                  isActive
                    ? "font-medium text-canvas"
                    : "bg-secondary/70 font-medium text-primary/80 ring-1 ring-primary/10 hover:text-primary hover:ring-primary/25"
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
