"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { buildReviewSteps } from "@/data/reviewQuestions";
import { useClient, useClientHref, useSession } from "@/components/ClientProvider";
import { RatingOption } from "@/components/RatingOption";
import { ReviewItemOption } from "@/components/review/ReviewItemOption";
import { ProgressDots } from "@/components/ProgressDots";
import { StatusScreen } from "@/components/StatusScreen";
import { Button } from "@/components/ui/Button";
import { ScreenHeader } from "@/components/ScreenHeader";
import { ChevronLeft, ArrowRight } from "@/components/icons";
import type { ReviewStepId } from "@/types/review";

export function ReviewStepScreen({ stepId }: { stepId: ReviewStepId }) {
  const router = useRouter();
  const client = useClient();
  const href = useClientHref();
  const steps = useMemo(() => buildReviewSteps(client), [client]);
  const index = steps.findIndex((s) => s.id === stepId);
  const step = steps[index];
  const review = useSession((s) => s.review);
  const setOverallRating = useSession((s) => s.setOverallRating);
  const setStaffRating = useSession((s) => s.setStaffRating);
  const setServiceRating = useSession((s) => s.setServiceRating);
  const toggleItem = useSession((s) => s.toggleItem);

  // Only IDs that exist in THIS client's menu count as selected.
  const validSelected = useMemo(() => {
    const ids = new Set(client.menu.map((i) => i.id));
    return review.selectedItemIds.filter((id) => ids.has(id));
  }, [client.menu, review.selectedItemIds]);

  if (!step) {
    // e.g. /review/items for a client without a menu
    return (
      <div className="flex min-h-[100dvh] flex-col">
        <ScreenHeader title="Leave a Review" backPath="/review" showMenu={false} />
        <StatusScreen emoji="📝" title="Nothing to answer here" message="This question isn't available. Let's continue your review." action={{ label: "Continue", href: href("/review/generating") }} />
      </div>
    );
  }

  const currentValue = step.id === "experience" ? review.overallRating : step.id === "staff" ? review.staffRating : step.id === "service" ? review.serviceRating : null;

  const handleSelect = (value: string) => {
    if (step.id === "experience") setOverallRating(value);
    else if (step.id === "staff") setStaffRating(value);
    else if (step.id === "service") setServiceRating(value);
  };

  const isItems = step.type === "items";
  // Items are optional: the customer may not have tried anything on the list.
  const canContinue = isItems ? true : Boolean(currentValue);
  const prevPath = index === 0 ? "/review" : `/review/${steps[index - 1].segment}`;
  const isLast = index === steps.length - 1;
  const goNext = () => router.push(href(isLast ? "/review/generating" : `/review/${steps[index + 1].segment}`));
  const nextLabel = isLast ? (isItems && validSelected.length === 0 ? "Skip & Generate" : "Generate Review") : "Next";

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <ScreenHeader title="Leave a Review" backPath={prevPath} showMenu={false} />

      <div className="px-5 pt-2">
        <ProgressDots total={steps.length} current={index} />
        <p className="mt-2 text-xs font-medium text-muted">
          Step {index + 1} of {steps.length}
        </p>
      </div>

      <div key={step.id} className="flex-1 px-5 pb-6 pt-5 animate-fade-in">
        <h2 className="font-display text-2xl font-bold leading-snug text-primary">{step.title}</h2>
        <p className="mt-1.5 text-sm text-muted">{step.helper}</p>
        {step.type === "items" ? (
          <>
            <p className="mt-4 text-xs font-semibold text-muted" aria-live="polite">
              {validSelected.length === 0 ? "No items selected" : `${validSelected.length} selected`}
            </p>
            <div className="mt-2 space-y-3" role="group" aria-label={step.title}>
              {step.items.map((item) => (
                <ReviewItemOption key={item.id} item={item} selected={validSelected.includes(item.id)} onToggle={() => toggleItem(item.id)} />
              ))}
            </div>
          </>
        ) : (
          <div className="mt-6 space-y-3">
            {step.choices.map((c) => (
              <RatingOption key={c.value} emoji={c.emoji} label={c.label} selected={currentValue === c.value} onSelect={() => handleSelect(c.value)} />
            ))}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 flex gap-3 border-t border-primary/10 bg-canvas/95 px-5 py-4 backdrop-blur-md" style={{ paddingBottom: "calc(var(--safe-bottom) + 1rem)" }}>
        <Button variant="secondary" onClick={() => router.push(href(prevPath))}>
          <ChevronLeft width={18} height={18} /> Back
        </Button>
        <Button full disabled={!canContinue} onClick={goNext}>
          {nextLabel}
          <ArrowRight width={18} height={18} />
        </Button>
      </div>
    </div>
  );
}
