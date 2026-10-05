"use client";

import type { MenuItem } from "@/types/menu";
import { SmartImage } from "@/components/menu/SmartImage";
import { Check } from "@/components/icons";

/** A real menu item as a selectable "What did you try here?" option (no emojis). */
export function ReviewItemOption({ item, selected, onToggle }: { item: MenuItem; selected: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={onToggle}
      className={`press flex w-full items-center gap-4 rounded-2xl border-2 px-3 py-3 text-left transition-all ${
        selected ? "border-primary bg-primary/5 shadow-sm" : "border-primary/12 bg-surface hover:border-primary/30"
      }`}
    >
      <SmartImage src={item.image} alt="" sizes="48px" fallback="neutral" className="h-12 w-12 shrink-0 rounded-xl" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-primary">{item.name}</span>
        <span className="block truncate text-xs text-muted">{item.category}</span>
      </span>
      <span
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 transition-all ${selected ? "border-primary bg-primary text-canvas" : "border-primary/25"}`}
        aria-hidden
      >
        {selected && <Check width={14} height={14} />}
      </span>
    </button>
  );
}
