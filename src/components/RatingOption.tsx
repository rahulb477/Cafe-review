"use client";

import { Check } from "./icons";

interface Props {
  emoji: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
}

export function RatingOption({ emoji, label, selected, onSelect }: Props) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`press flex w-full items-center gap-4 rounded-2xl border-2 px-4 py-3.5 text-left transition-all ${
        selected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-primary/12 bg-surface hover:border-primary/30"
      }`}
    >
      <span
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-2xl transition-transform ${
          selected ? "scale-110 bg-accent/20" : "bg-secondary"
        }`}
      >
        {emoji}
      </span>
      <span className="flex-1 text-[15px] font-semibold text-primary">{label}</span>
      <span
        className={`grid h-6 w-6 place-items-center rounded-full border-2 transition-all ${
          selected ? "border-primary bg-primary text-canvas" : "border-primary/25"
        }`}
      >
        {selected && <Check width={14} height={14} />}
      </span>
    </button>
  );
}
