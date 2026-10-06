import { Star } from "@/components/icons";

export function Stars({
  rating,
  size = 14,
  showValue = false,
  valueClassName = "text-sm font-semibold text-primary",
}: {
  rating: number;
  size?: number;
  showValue?: boolean;
  /** Optional styling for the numeric value (e.g. smaller type on menu cards). */
  valueClassName?: string;
}) {
  const r = Math.max(0, Math.min(5, rating));
  return (
    <span className="inline-flex items-center gap-1" aria-label={`Rated ${r} out of 5`}>
      <span className="inline-flex items-center gap-0.5 text-accent" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} filled={i < Math.round(r)} width={size} height={size} className={i < Math.round(r) ? "" : "opacity-35"} />
        ))}
      </span>
      {showValue && <span className={valueClassName} aria-hidden>{r.toFixed(1)}</span>}
    </span>
  );
}
