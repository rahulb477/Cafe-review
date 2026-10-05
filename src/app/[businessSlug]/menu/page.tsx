"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ScreenHeader } from "@/components/ScreenHeader";
import { MenuItemCard, MenuItemCardSkeleton } from "@/components/MenuItemCard";
import { StatusScreen } from "@/components/StatusScreen";
import { useClient, useClientHref } from "@/components/ClientProvider";
import { getMenu, getCategories, getItemSlug } from "@/services/menuService";
import type { MenuItem } from "@/types/menu";
import { trackEvent } from "@/services/firebase/analyticsService";

export default function MenuPage() {
  return (
    <div className="flex flex-col">
      <ScreenHeader title="Our Menu" backPath="/" />
      <Suspense fallback={<MenuListSkeleton />}>
        <MenuContent />
      </Suspense>
    </div>
  );
}

function MenuListSkeleton() {
  return (
    <div className="px-4 py-3">
      <div className="mb-4 flex gap-2 overflow-hidden">
        {[56, 72, 88, 64, 60].map((w, i) => (
          <div key={i} className="skeleton h-10 shrink-0 rounded-full" style={{ width: w }} />
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2" aria-label="Loading menu">
        {Array.from({ length: 6 }).map((_, i) => (
          <MenuItemCardSkeleton key={i} />
        ))}
      </div>
    </div>
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

      <div className="px-4 pb-6 pt-2">
        {!items && !error && (
          <div className="grid gap-3 md:grid-cols-2" aria-label="Loading menu">
            {Array.from({ length: 6 }).map((_, i) => (
              <MenuItemCardSkeleton key={i} />
            ))}
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
            <div className="mb-3 flex items-baseline justify-between px-1">
              <h2 className="font-display text-lg font-bold text-primary">{active === "All" ? "Everything" : active}</h2>
              <span className="text-xs font-medium text-muted" aria-live="polite">
                {filtered.length} {filtered.length === 1 ? "item" : "items"}
              </span>
            </div>
            {filtered.length > 0 ? (
              <div key={active} className="grid gap-3 md:grid-cols-2">
                {filtered.map((item, i) => {
                  const slug = getItemSlug(item);
                  const to = href(`/menu/${slug}`) + (active !== "All" ? `?from=${encodeURIComponent(active)}` : "");
                  return <MenuItemCard key={item.id} item={item} currency={client.currency} href={to} index={i} />;
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center rounded-3xl bg-surface px-6 py-12 text-center shadow-card">
                <span className="text-4xl" aria-hidden>
                  🍽️
                </span>
                <p className="mt-3 font-semibold text-primary">Nothing here yet</p>
                <p className="mt-1 text-sm text-muted">Try another category — there&apos;s plenty more to explore.</p>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

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
    <div className="sticky z-10 border-b border-primary/5 bg-canvas/95 pb-3 pt-1 backdrop-blur-md" style={{ top: "calc(var(--safe-top) + 60px)" }}>
      <div
        ref={scrollerRef}
        className="no-scrollbar overflow-x-auto [mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-12px),transparent)]"
      >
        <div role="tablist" aria-label="Menu categories" onKeyDown={onKeyDown} className="relative flex w-max gap-2 px-4 py-0.5">
          <span
            ref={indicatorRef}
            aria-hidden
            className="absolute bottom-0.5 left-0 top-0.5 rounded-full bg-primary opacity-0 shadow-md shadow-primary/25 transition-[transform,width] duration-300 ease-out"
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
                className={`press relative z-10 h-10 shrink-0 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors duration-300 ${
                  isActive ? "text-canvas" : "bg-surface/70 text-primary-mid ring-1 ring-primary/10 hover:text-primary hover:ring-primary/25"
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
