import type { ReviewAnswers } from "@/types/review";

/**
 * Deterministic-ish template review writer. Pure function, safe on both server
 * (MockAIProvider) and client (offline fallback). Contains no client branding;
 * the business name is passed in.
 */

const openers = [
  "Had a lovely time at {name} today!",
  "Dropped by {name} and I'm so glad I did.",
  "What a treat visiting {name}!",
  "{name} never disappoints.",
  "Spent a wonderful little while at {name}.",
];

const experiencePhrases: Record<string, string[]> = {
  Amazing: ["The overall experience was absolutely amazing", "Everything about the visit was fantastic"],
  Good: ["The overall experience was really good", "It was a genuinely pleasant visit"],
  Okay: ["The experience was decent overall", "It was an okay visit on the whole"],
  Poor: ["The experience could have been better", "It was a slightly underwhelming visit"],
  "Very Poor": ["Sadly the experience fell short this time", "The visit didn't quite meet my expectations"],
};

const staffPhrases: Record<string, string[]> = {
  Amazing: ["and the staff were wonderfully warm and attentive", "and the team was incredibly welcoming"],
  Good: ["and the staff were friendly and helpful", "with a courteous and kind team"],
  Okay: ["and the staff were reasonably helpful", "with fairly attentive staff"],
  Poor: ["though the staff could be more attentive", "though the staff seemed a little distracted"],
  "Very Poor": ["though the service from staff needs improvement", "though the staff seemed quite rushed"],
};

const servicePhrases: Record<string, string[]> = {
  Excellent: ["Service was quick and seamless.", "The service was wonderfully efficient."],
  Good: ["Service was smooth and timely.", "The service was reliably good."],
  Average: ["Service was alright.", "The service was about average."],
  Slow: ["Service was a touch slow.", "I did have to wait a while for service."],
};

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

/** Joins real menu item names, keeping their original casing. */
function joinList(items: string[]): string {
  const l = items;
  if (l.length === 1) return l[0];
  if (l.length === 2) return `${l[0]} and ${l[1]}`;
  return `${l.slice(0, -1).join(", ")}, and ${l[l.length - 1]}`;
}

export function writeTemplateReview(
  answers: ReviewAnswers,
  businessName: string,
  seed = Math.floor(Math.random() * 10000)
): string {
  const parts: string[] = [pick(openers, seed).replace("{name}", businessName)];
  const positive = answers.overallRating === "Amazing" || answers.overallRating === "Good";

  if (answers.overallRating) {
    const exp = pick(experiencePhrases[answers.overallRating] ?? ["The experience was memorable"], seed + 1);
    const staff = answers.staffRating ? " " + pick(staffPhrases[answers.staffRating] ?? [""], seed + 2) : "";
    parts.push(`${exp}${staff}.`);
  }
  if (answers.serviceRating) {
    parts.push(pick(servicePhrases[answers.serviceRating] ?? ["The service was good."], seed + 3));
  }
  const items = answers.selectedItems.map((i) => i.trim()).filter(Boolean);
  if (items.length > 0) {
    parts.push(
      positive ? `I tried the ${joinList(items)} and absolutely loved every bite.` : `I tried the ${joinList(items)} during my visit.`
    );
  }
  parts.push(positive ? "Highly recommend — I'll definitely be back!" : "Looking forward to my next visit.");
  return parts.join(" ");
}
