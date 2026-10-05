"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useClient, useClientHref, useSession } from "@/components/ClientProvider";
import { generateReview } from "@/services/aiReviewService";
import { saveReview } from "@/services/reviewService";
import { StatusScreen } from "@/components/StatusScreen";
import { trackEvent } from "@/services/firebase/analyticsService";
import { resolveSelectedItems } from "@/data/reviewQuestions";
import { Check, Coffee } from "@/components/icons";

const stages = ["Analyzing your responses", "Creating a personalized review", "Making it sound natural", "Almost ready..."];

export default function GeneratingPage() {
  const router = useRouter();
  const client = useClient();
  const href = useClientHref();
  const hydrated = useSession((s) => s.hydrated);
  const review = useSession((s) => s.review);
  const tableNumber = useSession((s) => s.tableNumber);
  const location = useSession((s) => s.location);
  const customerId = useSession((s) => s.customerId);
  const setGeneratedReview = useSession((s) => s.setGeneratedReview);
  const [stage, setStage] = useState(0);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const started = useRef(-1);

  useEffect(() => {
    if (!hydrated || started.current === attempt) return;
    started.current = attempt;

    if (!review.overallRating) {
      router.replace(href("/review/experience"));
      return;
    }

    // itemsTried = names of the selected items from THIS client's menu only.
    const picked = resolveSelectedItems(review, client.menu);
    const answers = {
      overallRating: review.overallRating,
      staffRating: review.staffRating,
      serviceRating: review.serviceRating,
      selectedItems: picked.map((i) => i.name),
    };

    (async () => {
      try {
        const result = await generateReview(
          { clientSlug: client.slug, clientId: client.id, source: client.source, businessName: client.businessName, answers },
          (s) => setStage(s)
        );
        setGeneratedReview(result.text);
        void saveReview(client, { ...answers, menuItemIds: picked.map((i) => i.id), clientId: client.id, tableNumber, location }, result.text, customerId, result.provider);
        trackEvent(client, "AI_REVIEW_GENERATED", { tableId: tableNumber });
        setTimeout(() => router.replace(href("/review/preview")), 450);
      } catch {
        setFailed(true);
      }
    })();
  }, [hydrated, attempt, review, router, href, client, setGeneratedReview, tableNumber, location, customerId]);

  if (failed) {
    return (
      <StatusScreen
        emoji="🤖"
        title="We couldn't write your review"
        message="Something went wrong while generating your review. Please try again."
        action={{
          label: "Try again",
          onClick: () => {
            setFailed(false);
            setStage(0);
            setAttempt((a) => a + 1);
          },
        }}
      />
    );
  }

  const progress = Math.min((stage / stages.length) * 100, 100);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-8 text-center animate-fade-in" aria-live="polite">
      <div className="relative grid h-24 w-24 place-items-center">
        <span className="absolute inset-0 rounded-full border-4 border-primary/15" />
        <span className="absolute inset-0 rounded-full border-4 border-transparent border-t-accent" style={{ animation: "spin-slow 1s linear infinite" }} />
        <Coffee width={40} height={40} className="text-primary" />
      </div>
      <h1 className="mt-7 font-display text-2xl font-bold text-primary">Our AI is writing your review…</h1>
      <p className="mt-1 text-sm text-muted">Hang tight, this only takes a moment.</p>

      <div className="mt-8 w-full max-w-xs space-y-3 text-left">
        {stages.map((label, i) => {
          const done = stage > i;
          const active = stage === i;
          return (
            <div key={label} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all ${done ? "bg-primary/5" : active ? "bg-accent/10" : ""}`}>
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${
                  done ? "border-primary bg-primary text-canvas" : active ? "border-accent text-accent" : "border-primary/25 text-transparent"
                }`}
              >
                {done ? <Check width={13} height={13} /> : active ? <span className="h-2 w-2 rounded-full bg-accent" style={{ animation: "pop-in 0.6s ease infinite alternate" }} /> : null}
              </span>
              <span className={`text-sm font-medium ${done || active ? "text-primary" : "text-primary/40"}`}>{label}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-8 h-2 w-full max-w-xs overflow-hidden rounded-full bg-primary/10">
        <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
