import type { CSSProperties } from "react";
import type { ClientTheme } from "@/types/client";

/** Converts a client theme into CSS custom properties consumed by Tailwind tokens. */
export function themeToCssVars(theme: ClientTheme): CSSProperties {
  return {
    "--brand-primary": theme.primary,
    "--brand-primary-dark": theme.primaryDark,
    "--brand-secondary": theme.secondary,
    "--brand-accent": theme.accent,
    "--brand-on-accent": theme.onAccent,
    "--brand-background": theme.background,
    "--brand-surface": theme.surface,
    "--brand-text": theme.text,
    "--brand-muted": theme.muted,
    "--brand-button": theme.button ?? theme.primary,
    "--brand-radius": theme.borderRadius,
    ...(theme.fontDisplay ? { "--brand-font-display": theme.fontDisplay } : {}),
  } as CSSProperties;
}
