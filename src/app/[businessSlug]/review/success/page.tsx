"use client";

import { useRouter } from "next/navigation";
import { useClient, useClientHref } from "@/components/ClientProvider";
import { Button } from "@/components/ui/Button";
import { GoogleReviewButton } from "@/components/GoogleReviewButton";
import { Home } from "@/components/icons";

export default function SuccessPage() {
  const router = useRouter();
  const client = useClient();
  const href = useClientHref();

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-8 text-center">
      <div className="relative mb-2">
        <div className="animate-celebrate">
          <span className="text-[84px] leading-none" aria-hidden>
            🎉
          </span>
        </div>
        <div className="pointer-events-none absolute inset-0 -z-10">
          {["bg-accent", "bg-emerald-400", "bg-sky-400", "bg-pink-400", "bg-amber-400", "bg-purple-400"].map((c, i) => (
            <span key={i} className={`absolute left-1/2 top-1/2 h-2 w-2 rounded-full ${c}`} style={{ transform: `rotate(${i * 60}deg) translateY(-62px)` }} />
          ))}
        </div>
      </div>
      <h1 className="mt-4 font-display text-3xl font-bold text-primary animate-slide-up">Review Copied!</h1>
      <p className="mt-2 max-w-xs text-sm text-muted animate-slide-up">
        Thank you for sharing your experience with {client.businessName}.{client.loyalty.enabled ? " Show your QR code to our staff to collect stamps." : ""}
      </p>
      <div className="mt-10 w-full max-w-xs space-y-3">
        <GoogleReviewButton variant="primary" />
        <Button variant="secondary" full size="lg" onClick={() => router.push(href("/"))}>
          <Home width={18} height={18} /> Back to Home
        </Button>
      </div>
    </div>
  );
}
