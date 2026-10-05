"use client";

import { useClient } from "./ClientProvider";
import { trackEvent } from "@/services/firebase/analyticsService";
import { ArrowRight } from "./icons";

/** Opens the client's configured Google review URL, or shows a friendly notice if it's missing. */
export function GoogleReviewButton({ variant = "secondary" }: { variant?: "primary" | "secondary" }) {
  const client = useClient();
  const { googleReviewUrl } = client;
  const valid = !!googleReviewUrl && /^https?:\/\//.test(googleReviewUrl);

  if (!valid) {
    return (
      <p role="status" className="w-full rounded-2xl bg-secondary px-4 py-3 text-center text-sm text-muted">
        Google Reviews isn&apos;t set up for this location yet. Please ask our staff — thank you!
      </p>
    );
  }
  return (
    <a
      href={googleReviewUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackEvent(client, "GOOGLE_REVIEW_CLICKED")}
      className={`press flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-semibold ${
        variant === "primary" ? "bg-button text-canvas shadow-md shadow-primary/20" : "bg-secondary text-primary"
      }`}
    >
      Open Google Reviews
      <ArrowRight width={18} height={18} />
    </a>
  );
}
