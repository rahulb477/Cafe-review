import type { ClientConfig } from "@/types/client";
import type { MenuItem } from "@/types/menu";
import type { RatingChoice, ReviewAnswers, ReviewDraft, ReviewStep } from "@/types/review";

const fivePoint: RatingChoice[] = [
  { value: "Very Poor", label: "Very Poor", emoji: "😠", weight: 1 },
  { value: "Poor", label: "Poor", emoji: "🙁", weight: 2 },
  { value: "Okay", label: "Okay", emoji: "😐", weight: 3 },
  { value: "Good", label: "Good", emoji: "😊", weight: 4 },
  { value: "Amazing", label: "Amazing", emoji: "🤩", weight: 5 },
];

const serviceChoices: RatingChoice[] = [
  { value: "Slow", label: "Slow", emoji: "🐢", weight: 1 },
  { value: "Average", label: "Average", emoji: "🙂", weight: 2 },
  { value: "Good", label: "Good", emoji: "😊", weight: 3 },
  { value: "Excellent", label: "Excellent", emoji: "⚡", weight: 4 },
];

/**
 * Builds the review steps for a client. The "What did you try here?" options are
 * the client's own (active) menu items — loaded from Firestore for Firebase
 * tenants. If the client has no menu, that step is omitted.
 */
export function buildReviewSteps(client: Pick<ClientConfig, "reviewSettings" | "menu">): ReviewStep[] {
  const t = client.reviewSettings.questionTitles ?? {};
  const steps: ReviewStep[] = [
    { id: "experience", segment: "experience", title: t.experience ?? "How was your overall experience?", helper: "Tap the option that best describes your visit.", type: "single", choices: fivePoint },
    { id: "staff", segment: "staff", title: t.staff ?? "How was the Staff Behaviour?", helper: "Were our team members friendly and helpful?", type: "single", choices: fivePoint },
    { id: "service", segment: "service", title: t.service ?? "How was the Service?", helper: "How quick and smooth was your service?", type: "single", choices: serviceChoices },
  ];
  if (client.menu.length > 0) {
    steps.push({
      id: "items",
      segment: "items",
      title: t.items ?? "What did you try here?",
      helper: "Select everything you tried — only the items you pick will be mentioned.",
      type: "items",
      items: client.menu,
    });
  }
  return steps;
}

/** Selected items in menu order, restricted to the current client's menu. */
export function resolveSelectedItems(draft: Pick<ReviewDraft, "selectedItemIds">, menu: MenuItem[]): MenuItem[] {
  const ids = new Set(draft.selectedItemIds);
  return menu.filter((i) => ids.has(i.id));
}

/** Converts the stored draft into the structured answers used by the AI/review generator. */
export function toReviewAnswers(draft: ReviewDraft, menu: MenuItem[]): ReviewAnswers {
  return {
    overallRating: draft.overallRating,
    staffRating: draft.staffRating,
    serviceRating: draft.serviceRating,
    selectedItems: resolveSelectedItems(draft, menu).map((i) => i.name),
  };
}
