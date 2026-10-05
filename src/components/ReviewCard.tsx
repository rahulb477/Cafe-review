import { Star } from "./icons";

export function ReviewCard({ text }: { text: string }) {
  return (
    <div className="rounded-3xl bg-surface p-5 shadow-[0_10px_30px_-14px_color-mix(in_srgb,var(--brand-primary)_40%,transparent)]">
      <div className="mb-3 flex items-center gap-1 text-accent">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} filled width={18} height={18} />
        ))}
      </div>
      <p className="text-[15px] leading-relaxed text-primary">{text}</p>
    </div>
  );
}
