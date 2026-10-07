const DASH = "—";

export interface NormalizedReview {
  id: string;
  clientId: string | null;
  customerId: string | null;
  foodRating: number | null;
  serviceRating: number | null;
  atmosphereRating: number | null;
  overallRating: number | null;
  reviewText: string;
  selectedItems: string[];
  source: string | null;
  status: string | null;
  createdAt: unknown;
  updatedAt: unknown;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function cleanText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstDefined(data: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = data[key];
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null;
}

/** Converts numeric values and common rating labels to a valid 1–5 score. */
export function normalizeRating(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 1 && value <= 5 ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;

  const text = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const numeric = Number(text);
    return Number.isFinite(numeric) && numeric >= 1 && numeric <= 5 ? numeric : null;
  }

  const label = text.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  const labels: Record<string, number> = {
    terrible: 1,
    awful: 1,
    slow: 1,
    "very poor": 1,
    poor: 2,
    "below average": 2,
    average: 3,
    okay: 3,
    ok: 3,
    good: 4,
    great: 4,
    excellent: 5,
    amazing: 5,
    "very good": 5,
  };
  return labels[label] ?? null;
}

function normalizeStatus(value: unknown): string | null {
  const status = cleanText(value);
  if (!status) return null;
  const normalized = status.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  const known: Record<string, string> = {
    new: "New",
    submitted: "Submitted",
    pending: "Pending",
    published: "Published",
    approved: "Approved",
    hidden: "Hidden",
    rejected: "Rejected",
    archived: "Archived",
  };
  return known[normalized] ?? status;
}

function itemNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter(Boolean)
    .slice(0, 50);
}

/** Maps current and legacy review documents into the canonical Admin schema. */
export function normalizeReviewRecord(id: string, raw: unknown): NormalizedReview {
  const data = record(raw);
  const legacyRating = firstDefined(data, ["overallRating", "rating", "overall"]);
  return {
    id: cleanText(data.id) ?? id,
    clientId: cleanText(data.clientId),
    customerId: cleanText(data.customerId),
    foodRating: normalizeRating(firstDefined(data, ["foodRating", "food"])),
    serviceRating: normalizeRating(firstDefined(data, ["serviceRating", "service"])),
    atmosphereRating: normalizeRating(firstDefined(data, ["atmosphereRating", "atmosphere"])),
    overallRating: normalizeRating(legacyRating),
    reviewText: cleanText(firstDefined(data, ["reviewText", "generatedReview", "text"])) ?? DASH,
    selectedItems: itemNames(firstDefined(data, ["selectedItems", "itemsTried"])),
    source: cleanText(firstDefined(data, ["source", "provider"])),
    status: normalizeStatus(data.status),
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
  };
}

/** One review contributes one score: overallRating first, else its valid dimensions' mean. */
export function scoreReview(review: Pick<NormalizedReview, "overallRating" | "foodRating" | "serviceRating" | "atmosphereRating">): number | null {
  if (review.overallRating !== null && Number.isFinite(review.overallRating)) return review.overallRating;
  const dimensions = [review.foodRating, review.serviceRating, review.atmosphereRating]
    .filter((rating): rating is number => typeof rating === "number" && Number.isFinite(rating) && rating >= 1 && rating <= 5);
  if (!dimensions.length) return null;
  return dimensions.reduce((total, rating) => total + rating, 0) / dimensions.length;
}

/** At most two decimal places, with a single decimal for whole-number averages (5.0). */
export function formatAverageRating(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1 || value > 5) return DASH;
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  const fixed = rounded.toFixed(2);
  const trimmed = fixed.replace(/(\.\d*?[1-9])0+$/, "$1");
  return trimmed.endsWith(".00") ? `${trimmed.slice(0, -3)}.0` : trimmed;
}

export type StarCount = 1 | 2 | 3 | 4 | 5;

export interface ReviewAnalytics {
  totalReviews: number;
  ratedReviews: number;
  averageRating: number | null;
  averageDisplay: string;
  distribution: Record<StarCount, number>;
}

/** Computes live analytics from review documents; invalid/missing scores are excluded. */
export function calculateReviewAnalytics(rows: Array<{ id?: string; data?: unknown } | NormalizedReview>): ReviewAnalytics {
  const distribution: Record<StarCount, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const scores: number[] = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const normalized = "foodRating" in row && "overallRating" in row
      ? normalizeReviewRecord(row.id || String(index), row)
      : normalizeReviewRecord(row.id ?? String(index), row.data);
    const score = scoreReview(normalized);
    if (score === null || !Number.isFinite(score)) continue;
    scores.push(score);
    const star = Math.max(1, Math.min(5, Math.round(score))) as StarCount;
    distribution[star] += 1;
  }

  const averageRating = scores.length ? scores.reduce((total, score) => total + score, 0) / scores.length : null;
  return {
    totalReviews: rows.length,
    ratedReviews: scores.length,
    averageRating,
    averageDisplay: formatAverageRating(averageRating),
    distribution,
  };
}
