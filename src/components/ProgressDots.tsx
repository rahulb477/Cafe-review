export function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center gap-2" role="progressbar" aria-valuenow={current + 1} aria-valuemin={1} aria-valuemax={total}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-2 rounded-full transition-all duration-300 ${
            i === current ? "w-6 bg-primary" : i < current ? "w-2 bg-primary/60" : "w-2 bg-primary/20"
          }`}
        />
      ))}
    </div>
  );
}
