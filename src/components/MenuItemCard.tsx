"use client";

import Link from "next/link";
import type { MenuItem } from "@/types/menu";
import { useSession } from "@/components/ClientProvider";
import { SmartImage } from "./menu/SmartImage";
import { Stars } from "./menu/Stars";
import { ChevronRight, Heart } from "./icons";

/**
 * Premium café menu card: framed product image, editorial type, favourite
 * heart and a "View details" affordance. The whole card is one keyboard
 * accessible link (stretched to the card edges); the heart sits above it as
 * a sibling button so it is a real, independently focusable control.
 */
export function MenuItemCard({ item, currency, href, index = 0 }: { item: MenuItem; currency: string; href: string; index?: number }) {
  const favorites = useSession((s) => s.favorites);
  const toggleFavorite = useSession((s) => s.toggleFavorite);
  const saved = favorites.includes(item.id);

  const label = [item.name, `${currency}${item.price}`, item.rating ? `rated ${item.rating} out of 5` : null, "View details"]
    .filter(Boolean)
    .join(", ");

  return (
    <article className="group list-in relative h-full" style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}>
      <Link
        href={href}
        aria-label={label}
        className="flex h-full flex-col rounded-xl border border-primary/10 bg-surface p-2.5 outline-offset-2 transition-[translate,box-shadow,border-color] duration-200 after:absolute after:inset-0 after:content-[''] hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-card"
      >
        <SmartImage
          src={item.image}
          alt={item.name}
          emoji={item.emoji}
          sizes="(min-width: 1024px) 300px, (min-width: 640px) 46vw, 92vw"
          className="aspect-[4/3] w-full rounded-lg"
          imgClassName="group-hover:scale-[1.03]"
          emojiClassName="text-6xl"
          fallback={item.emoji ? "emoji" : "neutral"}
        />

        <div className="flex flex-1 flex-col px-1 pb-0.5 pt-3.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            <span>{item.category}</span>
            {item.featured && (
              <>
                <span aria-hidden className="text-primary/25">
                  •
                </span>
                <span className="text-accent">Popular</span>
              </>
            )}
          </p>

          <div className="mt-2 flex items-start justify-between gap-4">
            <h3 className="line-clamp-2 font-display text-[17px] leading-snug text-primary">{item.name}</h3>
            <p className="shrink-0 font-display text-[16px] leading-snug text-primary">
              <span className="mr-0.5 align-top text-[12px] text-primary/70">{currency}</span>
              {item.price}
            </p>
          </div>

          {item.rating ? (
            <div className="mt-1.5">
              <Stars rating={item.rating} size={11} showValue valueClassName="text-[11.5px] font-medium text-muted" />
            </div>
          ) : null}

          <p className="mt-2 line-clamp-2 text-[12.5px] leading-relaxed text-muted">{item.description}</p>

          <span className="mt-auto inline-flex items-center gap-1 pt-3.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary/75 transition-colors duration-200 group-hover:text-primary">
            View details
            <ChevronRight width={12} height={12} aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </span>
        </div>
      </Link>

      <button
        type="button"
        onClick={() => toggleFavorite(item.id)}
        aria-pressed={saved}
        aria-label={saved ? `Remove ${item.name} from favourites` : `Add ${item.name} to favourites`}
        className="press absolute right-5 top-5 z-10 grid h-10 w-10 place-items-center rounded-full bg-surface/90 text-primary ring-1 ring-primary/10 backdrop-blur-sm hover:bg-surface"
      >
        <Heart width={17} height={17} filled={saved} aria-hidden className={saved ? "text-accent" : "text-primary/65"} />
      </button>
    </article>
  );
}

export function MenuItemCardSkeleton() {
  return (
    <div className="rounded-xl border border-primary/10 bg-surface p-2.5" aria-hidden>
      <div className="skeleton aspect-[4/3] w-full rounded-lg" />
      <div className="px-1 pb-0.5 pt-3.5">
        <div className="skeleton h-2.5 w-16 rounded-sm" />
        <div className="mt-2 flex items-start justify-between gap-4">
          <div className="skeleton h-4 w-1/2 rounded-md" />
          <div className="skeleton h-4 w-10 rounded-md" />
        </div>
        <div className="mt-2 skeleton h-3 w-full rounded-md" />
        <div className="mt-1.5 skeleton h-3 w-2/3 rounded-md" />
        <div className="mt-4 skeleton h-2.5 w-24 rounded-sm" />
      </div>
    </div>
  );
}
