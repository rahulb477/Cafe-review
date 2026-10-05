"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { Chat, Star, Check } from "@/components/icons";
import { submitFeedback } from "@/services/feedbackService";
import { trackEvent } from "@/services/firebase/analyticsService";
import { useClient, useClientHref, useSession } from "@/components/ClientProvider";

const MIN_LENGTH = 3;
const MAX_LENGTH = 2000;

export default function FeedbackPage() {
  const router = useRouter();
  const client = useClient();
  const href = useClientHref();
  const tableNumber = useSession((s) => s.tableNumber);
  const location = useSession((s) => s.location);
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState(0);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const trimmed = message.trim();
  const tooShort = trimmed.length < MIN_LENGTH;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "loading") return;
    setError(null);
    if (tooShort) {
      setError(`Please tell us a little more (at least ${MIN_LENGTH} characters).`);
      return;
    }
    setStatus("loading");
    try {
      await submitFeedback(client, {
        message: trimmed,
        rating: rating || null,
        tableNumber,
        location,
      });
      // Feedback stays anonymous: the event carries no customer identity.
      trackEvent(client, "FEEDBACK_SUBMITTED", { tableId: tableNumber, includeCustomer: false });
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "We couldn't send your feedback. Please try again.");
    }
  };

  if (status === "done") {
    return (
      <div className="flex min-h-full flex-col">
        <ScreenHeader title="Feedback" backPath="/" />
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <span className="grid h-20 w-20 place-items-center rounded-full bg-emerald-100 text-emerald-600 animate-celebrate">
            <Check width={44} height={44} />
          </span>
          <h1 className="mt-6 font-display text-2xl font-bold text-primary">Thank you! 🙏</h1>
          <p className="mt-2 max-w-xs text-sm text-muted">
            Your feedback has been received anonymously. It helps us make {client.businessName} even better.
          </p>
          <div className="mt-8 w-full max-w-xs space-y-3">
            <Button
              full
              onClick={() => {
                setMessage("");
                setRating(0);
                setStatus("idle");
              }}
            >
              Send more feedback
            </Button>
            <Button variant="secondary" full onClick={() => router.push(href("/"))}>
              Back to Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader title="Anonymous Feedback" backPath="/" />
      {/*
        Layout: scrollable content (with bottom padding) → sticky footer holding the
        submit button, pinned above the fixed bottom nav + safe area. The button is
        therefore always on screen and never covered by the nav or (with
        interactive-widget=resizes-content) the keyboard.
      */}
      <form onSubmit={submit} noValidate className="flex flex-1 flex-col">
        <div className="flex-1 px-5 pb-6 pt-4 animate-fade-in">
          <div className="flex flex-col items-center text-center">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-sky-100 text-sky-600">
              <Chat width={32} height={32} />
            </span>
            <h1 className="mt-4 font-display text-2xl font-bold text-primary">Share your thoughts with us</h1>
            <p className="mt-1 text-sm text-muted">Your feedback helps us improve — no account needed.</p>
          </div>

          <p id="rating-label" className="mt-6 block text-sm font-semibold text-primary">
            How would you rate us? <span className="font-normal text-muted">(optional)</span>
          </p>
          <div className="mt-2 flex items-center gap-1.5" role="radiogroup" aria-labelledby="rating-label">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                onClick={() => setRating(n === rating ? 0 : n)}
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
                className="press grid h-11 w-11 place-items-center text-accent"
              >
                <Star filled={rating >= n} width={34} height={34} />
              </button>
            ))}
          </div>

          <label htmlFor="fb" className="mt-6 block text-sm font-semibold text-primary">
            Your feedback
          </label>
          <textarea
            id="fb"
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              if (error) setError(null);
              if (status === "error") setStatus("idle");
            }}
            placeholder="Tell us about your experience…"
            rows={5}
            maxLength={MAX_LENGTH}
            aria-invalid={!!error}
            aria-describedby="fb-help"
            className="mt-2 w-full resize-none rounded-2xl border-2 border-primary/15 bg-surface p-4 text-[15px] text-primary placeholder:text-primary/35 focus:border-primary/40 focus:outline-none"
          />
          <div id="fb-help" className="mt-1.5 flex justify-between gap-3 px-1 text-xs text-muted">
            <span>{tooShort ? `Write at least ${MIN_LENGTH} characters to send.` : "Thanks — you can send whenever you're ready."}</span>
            <span aria-hidden>
              {message.length}/{MAX_LENGTH}
            </span>
          </div>

          {error && (
            <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}
        </div>

        <div
          className="sticky z-10 border-t border-primary/10 bg-canvas/95 px-5 py-3 backdrop-blur-md"
          style={{ bottom: "calc(64px + var(--safe-bottom))" }}
        >
          <Button full size="lg" type="submit" disabled={status === "loading" || tooShort} aria-busy={status === "loading"}>
            {status === "loading" ? "Sending…" : status === "error" ? "Try Again" : "Submit Feedback"}
          </Button>
        </div>
      </form>
    </div>
  );
}
