"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useClient, useClientHref, useSession } from "@/components/ClientProvider";
import { ScreenHeader } from "@/components/ScreenHeader";
import { ReviewCard } from "@/components/ReviewCard";
import { Button } from "@/components/ui/Button";
import { GoogleReviewButton } from "@/components/GoogleReviewButton";
import { StatusScreen } from "@/components/StatusScreen";
import { writeTemplateReview } from "@/lib/reviewTemplates";
import { toReviewAnswers } from "@/data/reviewQuestions";
import { Copy, Check } from "@/components/icons";

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Legacy fallback for older in-app browsers.
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(ta);
  if (!ok) throw new Error("copy failed");
}

export default function PreviewPage() {
  const router = useRouter();
  const client = useClient();
  const href = useClientHref();
  const hydrated = useSession((s) => s.hydrated);
  const generated = useSession((s) => s.generatedReview);
  const review = useSession((s) => s.review);
  const setGeneratedReview = useSession((s) => s.setGeneratedReview);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hydrated && !generated && review.overallRating) setGeneratedReview(writeTemplateReview(toReviewAnswers(review, client.menu), client.businessName));
  }, [hydrated, generated, review, setGeneratedReview, client.businessName, client.menu]);

  const text = generated ?? "";

  const copy = async () => {
    setError(null);
    try {
      await copyText(text);
      setCopied(true);
      setTimeout(() => router.push(href("/review/success")), 650);
    } catch {
      setError("Couldn't copy automatically. Please press and hold the text above to copy it.");
    }
  };

  if (hydrated && !review.overallRating) {
    return (
      <div className="flex min-h-[100dvh] flex-col">
        <ScreenHeader title="Your Review" backPath="/review" showMenu={false} />
        <StatusScreen emoji="📝" title="No review yet" message="We couldn't find your review answers." action={{ label: "Start a review", href: href("/review") }} />
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <ScreenHeader title="Your Review" backPath={client.menu.length > 0 ? "/review/items" : "/review/service"} showMenu={false} />
      <div className="flex-1 px-5 pt-4 animate-fade-in">
        <h1 className="font-display text-2xl font-bold text-primary">Your Review is Ready! 🎉</h1>
        <p className="mt-1 text-sm text-muted">Copy it, then paste into Google Reviews — edit it however you like.</p>
        <div className="mt-5">{text ? <ReviewCard text={text} /> : <div className="h-40 animate-pulse rounded-3xl bg-primary/5" />}</div>
        <button
          onClick={() => setGeneratedReview(writeTemplateReview(toReviewAnswers(review, client.menu), client.businessName))}
          className="press mt-3 text-sm font-semibold text-primary-mid underline underline-offset-4"
        >
          Regenerate a different version
        </button>
        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
      <div className="sticky bottom-0 space-y-3 border-t border-primary/10 bg-canvas/95 px-5 py-4 backdrop-blur-md" style={{ paddingBottom: "calc(var(--safe-bottom) + 1rem)" }}>
        <Button full size="lg" onClick={copy} disabled={!text}>
          {copied ? <Check width={20} height={20} /> : <Copy width={20} height={20} />}
          {copied ? "Copied!" : "Copy Review"}
        </Button>
        <GoogleReviewButton />
      </div>
    </div>
  );
}
