import type { MenuItem } from "./menu";

export interface RatingChoice {
  value: string;
  label: string;
  emoji: string;
  /** Relative sentiment weight used by review generators. */
  weight: number;
}

export type ReviewStepId = "experience" | "staff" | "service" | "items";

interface BaseStep {
  id: ReviewStepId;
  /** Route segment under /[businessSlug]/review/ */
  segment: string;
  title: string;
  helper: string;
}

export interface RatingStep extends BaseStep {
  type: "single";
  choices: RatingChoice[];
}

/** "What did you try here?" — options are the client's real menu items. */
export interface ItemsStep extends BaseStep {
  type: "items";
  items: MenuItem[];
}

export type ReviewStep = RatingStep | ItemsStep;

/**
 * What the review flow stores while the customer answers. Items are stored as
 * menu item IDs of the CURRENT client's menu (never free text / demo labels).
 */
export interface ReviewDraft {
  overallRating: string | null;
  staffRating: string | null;
  serviceRating: string | null;
  selectedItemIds: string[];
}

/**
 * Structured answers sent to the AI / review generator.
 * `selectedItems` = itemsTried: the NAMES of the selected menu items only.
 */
export interface ReviewAnswers {
  overallRating: string | null;
  staffRating: string | null;
  serviceRating: string | null;
  selectedItems: string[];
}

/** Full review payload including session context. */
export interface ReviewSubmission extends ReviewAnswers {
  /** IDs of the selected menu items (same order as selectedItems). */
  menuItemIds: string[];
  clientId: string;
  tableNumber: string | null;
  location: string | null;
}

export interface ReviewSettings {
  shareTitle: string;
  shareSubtitle: string;
  /** Overrides the default question titles. */
  questionTitles?: Partial<Record<ReviewStepId, string>>;
}

export interface ReviewGenerationInput {
  clientSlug: string;
  answers: ReviewAnswers;
}

export interface ReviewGenerationResult {
  text: string;
  provider: "mock" | "ai";
}
