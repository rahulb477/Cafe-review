"use client";

import { Coffee } from "./icons";

/** Visual stamp slots. The number of slots comes from the client's stampTarget. */
export function StampGrid({ stamps, target, compact = false }: { stamps: number; target: number; compact?: boolean }) {
  const slots = Array.from({ length: target }, (_, i) => i < stamps);

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1.5" role="img" aria-label={`${Math.min(stamps, target)} of ${target} stamps`}>
        {slots.map((filled, i) => (
          <span key={i} className={`h-3 w-3 rounded-full border transition-colors ${filled ? "border-primary bg-primary" : "border-primary/40 bg-transparent"}`} />
        ))}
      </div>
    );
  }

  return (
    <div className={`grid gap-4 ${target % 5 === 0 && target > 8 ? "grid-cols-5" : target % 3 === 0 && target <= 6 ? "grid-cols-3" : "grid-cols-4"}`} role="img" aria-label={`${Math.min(stamps, target)} of ${target} stamps`}>
      {slots.map((filled, i) => (
        <div
          key={i}
          className={`grid aspect-square place-items-center rounded-full border-2 transition-all duration-300 ${filled ? "animate-pop-in border-primary bg-primary text-accent" : "border-primary/25 text-primary/20"}`}
        >
          {filled ? <Coffee width={26} height={26} /> : <span className="text-sm font-semibold text-primary/30">{i + 1}</span>}
        </div>
      ))}
    </div>
  );
}
