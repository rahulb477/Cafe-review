"use client";

import Link from "next/link";
import type { MenuItem } from "@/types/menu";
import { SmartImage } from "./menu/SmartImage";
import { Stars } from "./menu/Stars";
import { ChevronRight } from "./icons";

/** Whole card is a single, keyboard-accessible link to the item detail page. */
export function MenuItemCard({ item, currency, href, index = 0 }: { item: MenuItem; currency: string; href: string; index?: number }) {
  return (
    <Link
      href={href}
      className="press group list-in flex items-center gap-3.5 rounded-2xl bg-surface p-3 shadow-card outline-offset-2 hover:-translate-y-0.5 hover:shadow-card-hover active:scale-[0.98]"
      style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}
    >
      <SmartImage
        src={item.image}
        alt={item.name}
        emoji={item.emoji}
        sizes="80px"
        className="h-20 w-20 shrink-0 rounded-xl"
        imgClassName="group-hover:scale-105"
      />
      <div className="min-w-0 flex-1 py-0.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 text-[15px] font-semibold leading-snug text-primary">{item.name}</h3>
          <span className="shrink-0 text-[15px] font-bold leading-snug text-primary">
            {currency}
            {item.price}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{item.description}</p>
        <div className="mt-1.5 flex items-center gap-2">
          {item.rating ? <Stars rating={item.rating} size={12} /> : null}
          {item.featured && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">Popular</span>}
        </div>
      </div>
      <ChevronRight width={18} height={18} className="shrink-0 text-primary/30 transition-[translate,color] duration-200 group-hover:translate-x-0.5 group-hover:text-primary/60" aria-hidden />
      <span className="sr-only">View details</span>
    </Link>
  );
}

export function MenuItemCardSkeleton() {
  return (
    <div className="flex items-center gap-3.5 rounded-2xl bg-surface p-3 shadow-card" aria-hidden>
      <div className="skeleton h-20 w-20 shrink-0 rounded-xl" />
      <div className="flex-1 space-y-2">
        <div className="flex justify-between gap-6">
          <div className="skeleton h-4 w-2/3 rounded-md" />
          <div className="skeleton h-4 w-10 rounded-md" />
        </div>
        <div className="skeleton h-3 w-full rounded-md" />
        <div className="skeleton h-3 w-1/2 rounded-md" />
      </div>
    </div>
  );
}
