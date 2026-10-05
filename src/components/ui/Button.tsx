"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "gold";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  full?: boolean;
  children: ReactNode;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-button text-canvas hover:bg-primary-dark shadow-md shadow-primary/20",
  secondary:
    "bg-secondary text-primary border border-primary/15 hover:bg-canvas",
  ghost: "bg-transparent text-primary hover:bg-primary/5",
  gold: "bg-accent text-on-accent hover:brightness-105 shadow-md shadow-accent/30",
};

const sizes: Record<Size, string> = {
  sm: "text-sm px-3 py-2 rounded-xl gap-1.5",
  md: "text-[15px] px-4 py-3 rounded-2xl gap-2",
  lg: "text-base px-5 py-4 rounded-2xl gap-2",
};

export function Button({
  variant = "primary",
  size = "md",
  full,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`press inline-flex items-center justify-center font-semibold tracking-tight disabled:opacity-50 disabled:pointer-events-none ${
        variants[variant]
      } ${sizes[size]} ${full ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
