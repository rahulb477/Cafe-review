"use client";

import { useMemo, type ReactNode } from "react";
import type { MenuItem } from "@/types/menu";
import { useClient } from "@/components/ClientProvider";
import { useUi } from "@/components/AppShell";
import { getItemSlug, getRelatedItems } from "@/services/menuService";
import { SmartImage } from "./SmartImage";
import { Stars } from "./Stars";
import { CategoryAwareLink } from "./CategoryAwareLink";
import { ChevronLeft, MenuIcon, Clock, Flame, Leaf, AlertCircle, Utensils } from "@/components/icons";

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-surface p-4 shadow-card">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-muted">
        <span className="text-primary-mid">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Chips({ items, tone = "neutral" }: { items: string[]; tone?: "neutral" | "good" | "warn" }) {
  const cls =
    tone === "good" ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : tone === "warn" ? "bg-amber-50 text-amber-900 ring-amber-200" : "bg-secondary text-primary ring-primary/10";
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((i) => (
        <li key={i} className={`rounded-full px-3 py-1.5 text-[13px] font-medium ring-1 ${cls}`}>
          {i}
        </li>
      ))}
    </ul>
  );
}

const has = (a?: string[]) => Array.isArray(a) && a.length > 0;

export function MenuItemDetail({ item }: { item: MenuItem }) {
  const client = useClient();
  const { openDrawer } = useUi();
  const related = useMemo(() => getRelatedItems(client, item, 6), [client, item]);
  const sameCategory = related.some((r) => r.category === item.category);
  const floatBtn = "press grid h-11 w-11 place-items-center rounded-full bg-black/35 text-white backdrop-blur-md hover:bg-black/50";

  return (
    <article className="flex flex-1 flex-col md:px-8 md:pt-8">
      <div className="md:grid md:grid-cols-2 md:items-start md:gap-10">
        {/* Hero */}
        <div className="relative px-3 pt-3 md:sticky md:top-8 md:p-0" style={{ paddingTop: "calc(var(--safe-top) + 0.75rem)" }}>
          <SmartImage
            src={item.image}
            alt={item.name}
            emoji={item.emoji}
            priority
            sizes="(min-width: 768px) 440px, 100vw"
            className="aspect-[4/3] w-full rounded-3xl shadow-card md:aspect-square"
            emojiClassName="text-8xl"
          />
          <div className="pointer-events-none absolute inset-x-3 top-3 h-24 rounded-t-3xl bg-gradient-to-b from-black/25 to-transparent md:inset-x-0 md:top-0" aria-hidden />
          <div className="absolute inset-x-6 top-6 flex justify-between md:inset-x-3 md:top-3" style={{ top: "calc(var(--safe-top) + 1.5rem)" }}>
            <CategoryAwareLink path="/menu" param="category" className={floatBtn} aria-label="Back to menu">
              <ChevronLeft />
            </CategoryAwareLink>
            <button type="button" onClick={openDrawer} className={floatBtn} aria-label="Open menu">
              <MenuIcon />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-5 pt-5 md:px-0 md:pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-primary ring-1 ring-primary/10">{item.category}</span>
            {item.featured && <span className="rounded-full bg-accent/20 px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary">Popular</span>}
          </div>

          <h1 className="mt-3 font-display text-3xl font-bold leading-tight text-primary md:text-4xl">{item.name}</h1>

          <div className="mt-3 flex items-end justify-between gap-4">
            {item.rating ? <Stars rating={item.rating} size={18} showValue /> : <span />}
            <p className="font-display text-3xl font-bold text-primary">
              <span className="mr-0.5 align-top text-lg">{client.currency}</span>
              {item.price}
            </p>
          </div>

          {(item.preparationTime || typeof item.calories === "number") && (
            <div className="mt-4 flex flex-wrap gap-2">
              {item.preparationTime && (
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-surface px-3 py-2 text-sm font-medium text-primary shadow-card">
                  <Clock width={16} height={16} className="text-primary-mid" />
                  {item.preparationTime}
                </span>
              )}
              {typeof item.calories === "number" && (
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-surface px-3 py-2 text-sm font-medium text-primary shadow-card">
                  <Flame width={16} height={16} className="text-primary-mid" />
                  {item.calories} kcal
                </span>
              )}
            </div>
          )}

          <p className="mt-5 whitespace-pre-line text-[15px] leading-relaxed text-ink/85">{item.fullDescription || item.description}</p>

          <div className="mt-6 space-y-3">
            {has(item.ingredients) && (
              <Section title="Ingredients" icon={<Utensils width={14} height={14} />}>
                <Chips items={item.ingredients!} />
              </Section>
            )}
            {has(item.dietaryInfo) && (
              <Section title="Dietary" icon={<Leaf width={14} height={14} />}>
                <Chips items={item.dietaryInfo!} tone="good" />
              </Section>
            )}
            {has(item.allergens) && (
              <Section title="Allergens" icon={<AlertCircle width={14} height={14} />}>
                <Chips items={item.allergens!} tone="warn" />
                <p className="mt-3 text-xs text-muted">Please let our staff know about any allergies before ordering.</p>
              </Section>
            )}
          </div>

          {/* Desktop/tablet CTA */}
          <CategoryAwareLink
            path="/menu"
            param="category"
            className="press mt-8 hidden h-12 w-full items-center justify-center rounded-2xl bg-button font-semibold text-canvas shadow-md shadow-primary/20 hover:bg-primary-dark md:flex"
          >
            Back to Menu
          </CategoryAwareLink>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-8 pb-4" aria-labelledby="related-heading">
          <h2 id="related-heading" className="mb-3 px-5 font-display text-lg font-bold text-primary md:px-0">
            {sameCategory ? `More ${item.category}` : "You might also like"}
          </h2>
          <ul className="no-scrollbar flex snap-x gap-3 overflow-x-auto px-5 pb-2 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
            {related.map((r) => (
              <li key={r.id} className="w-36 shrink-0 snap-start md:w-auto">
                <CategoryAwareLink path={`/menu/${getItemSlug(r)}`} param="from" className="press group block rounded-2xl bg-surface p-2 shadow-card hover:-translate-y-0.5 hover:shadow-card-hover">
                  <SmartImage src={r.image} alt={r.name} emoji={r.emoji} sizes="160px" className="aspect-square w-full rounded-xl" imgClassName="group-hover:scale-105" />
                  <p className="mt-2 line-clamp-1 px-1 text-sm font-semibold text-primary">{r.name}</p>
                  <p className="px-1 pb-1 text-xs font-medium text-muted">
                    {client.currency}
                    {r.price}
                  </p>
                </CategoryAwareLink>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Mobile sticky CTA above the bottom nav */}
      <div className="sticky z-10 mt-auto border-t border-primary/10 bg-canvas/90 px-5 py-3 backdrop-blur-md md:hidden" style={{ bottom: "calc(64px + var(--safe-bottom))" }}>
        <CategoryAwareLink
          path="/menu"
          param="category"
          className="press flex h-12 w-full items-center justify-center rounded-2xl bg-button font-semibold text-canvas shadow-md shadow-primary/20 hover:bg-primary-dark"
        >
          Back to Menu
        </CategoryAwareLink>
      </div>
    </article>
  );
}
