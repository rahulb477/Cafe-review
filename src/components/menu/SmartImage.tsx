"use client";

import Image from "next/image";
import { useState } from "react";
import { Utensils } from "@/components/icons";

interface Props {
  src?: string;
  alt: string;
  emoji?: string;
  sizes: string;
  priority?: boolean;
  /** Wrapper classes — must define size/aspect ratio and radius. */
  className?: string;
  imgClassName?: string;
  emojiClassName?: string;
  /** "emoji" (menu default) or "neutral" — a plain icon tile, no emoji. */
  fallback?: "emoji" | "neutral";
}

/**
 * Fixed-aspect image with shimmer placeholder, fade-in and a branded emoji
 * fallback when the image is missing or fails — the layout never breaks.
 */
export function SmartImage({ src, alt, emoji, sizes, priority, className = "", imgClassName = "", emojiClassName = "text-3xl", fallback = "emoji" }: Props) {
  const [state, setState] = useState<"loading" | "loaded" | "error">(src ? "loading" : "error");

  return (
    <div className={`relative isolate overflow-hidden bg-secondary ${className}`}>
      {state === "loading" && <div className="skeleton absolute inset-0" aria-hidden />}
      {src && state !== "error" ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          unoptimized={/^https?:\/\//i.test(src)}
          onLoad={() => setState("loaded")}
          onError={() => setState("error")}
          className={`object-cover transition-[opacity,scale] duration-500 ease-out ${state === "loaded" ? "opacity-100" : "opacity-0"} ${imgClassName}`}
        />
      ) : (
        <div role="img" aria-label={alt} className="absolute inset-0 grid place-items-center bg-gradient-to-br from-secondary to-accent/25">
          {fallback === "neutral" ? (
            <Utensils width={22} height={22} className="text-primary/45" aria-hidden />
          ) : (
            <span className={`drop-shadow-sm ${emojiClassName}`} aria-hidden>
              {emoji ?? "🍽️"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
