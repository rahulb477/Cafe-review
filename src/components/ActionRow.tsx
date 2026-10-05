"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "./icons";

export function ActionRow({
  href,
  icon,
  label,
  accent,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  accent?: string;
}) {
  return (
    <Link
      href={href}
      className="press group flex min-h-[60px] items-center gap-4 rounded-2xl bg-surface px-4 py-3 shadow-card hover:-translate-y-0.5 hover:shadow-card-hover"
    >
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
          accent ?? "bg-primary/8 text-primary"
        }`}
      >
        {icon}
      </span>
      <span className="flex-1 text-[15px] font-semibold text-primary">{label}</span>
      <ChevronRight width={18} height={18} className="text-primary/40 transition-[translate,color] duration-200 group-hover:translate-x-0.5 group-hover:text-primary/70" />
    </Link>
  );
}
