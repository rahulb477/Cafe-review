import Link from "next/link";

interface Props {
  emoji: string;
  title: string;
  message: string;
  action?: { label: string; onClick?: () => void; href?: string };
}

/** Friendly full-screen state for errors, missing config and empty states. */
export function StatusScreen({ emoji, title, message, action }: Props) {
  const cls = "press mt-8 inline-flex rounded-2xl bg-primary px-6 py-3.5 font-semibold text-canvas";
  return (
    <div role="alert" className="flex min-h-[70dvh] flex-1 flex-col items-center justify-center px-8 text-center animate-fade-in">
      <span className="text-5xl" aria-hidden>{emoji}</span>
      <h1 className="mt-5 font-display text-2xl font-bold text-primary">{title}</h1>
      <p className="mt-2 max-w-xs text-sm text-muted">{message}</p>
      {action?.href && <Link href={action.href} className={cls}>{action.label}</Link>}
      {action?.onClick && !action.href && <button onClick={action.onClick} className={cls}>{action.label}</button>}
    </div>
  );
}
