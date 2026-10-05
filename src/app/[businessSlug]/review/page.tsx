"use client";

import { useRouter } from "next/navigation";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { GoogleReviewButton } from "@/components/GoogleReviewButton";
import { Google, Star, ArrowRight } from "@/components/icons";
import { useClient, useClientHref, useSession } from "@/components/ClientProvider";

export default function ReviewIntroPage() {
  const router = useRouter();
  const client = useClient();
  const href = useClientHref();
  const resetReview = useSession((s) => s.resetReview);

  const start = () => {
    resetReview();
    router.push(href("/review/experience"));
  };

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <ScreenHeader backPath="/" showMenu={false} />
      <div className="flex flex-1 flex-col items-center px-6 pt-6 text-center animate-fade-in">
        <span className="grid h-20 w-20 place-items-center rounded-3xl bg-white shadow-md">
          <Google width={44} height={44} />
        </span>
        <h1 className="mt-6 font-display text-3xl font-bold text-primary">{client.reviewSettings.shareTitle}</h1>
        <p className="mt-2 max-w-xs text-sm text-muted">
          {client.reviewSettings.shareSubtitle}.{" "}
          {client.aiReview.enabled ? "Our AI will write a first draft for you in seconds." : "Answer a few quick questions and we'll draft it for you."}
        </p>
        <div className="mt-6 flex items-center gap-1.5 text-accent">
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} filled width={34} height={34} />
          ))}
        </div>
        <div className="mt-auto w-full space-y-3 pb-8 pt-10">
          <Button full size="lg" onClick={start}>
            {client.aiReview.enabled ? "Write with AI" : "Start Review"}
            <ArrowRight width={20} height={20} />
          </Button>
          <GoogleReviewButton />
        </div>
      </div>
    </div>
  );
}
