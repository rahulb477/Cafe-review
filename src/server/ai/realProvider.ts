import "server-only";
import type { AIProvider, AIReviewRequest } from "./types";

/**
 * OpenAI-compatible chat-completions provider (works with OpenAI, Gemini's
 * OpenAI endpoint, OpenRouter, Groq, etc.). Keys are read from server-only env
 * vars and never reach the browser.
 */
export class RealAIProvider implements AIProvider {
  readonly name = "ai" as const;
  constructor(
    private apiKey: string,
    private model: string,
    private baseUrl: string
  ) {}

  async generateReview({ client, answers }: AIReviewRequest): Promise<string> {
    // Structured input: exact names of the menu items the customer selected.
    const items = answers.selectedItems.length ? answers.selectedItems.map((i) => `"${i.replace(/"/g, "")}"`).join(", ") : "none specified (do not invent dishes)";
    const prompt = [
      `Write a short, natural, first-person Google review (60-90 words) for "${client.businessName}".`,
      `Overall experience: ${answers.overallRating ?? "n/a"}. Staff behaviour: ${answers.staffRating ?? "n/a"}. Service: ${answers.serviceRating ?? "n/a"}. Menu items tried: ${items}. Only mention these items, using their exact names.`,
      "Match the sentiment honestly. No hashtags, no emojis overload, no mention of AI. Return only the review text.",
    ].join("\n");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.9,
          max_tokens: 220,
          messages: [
            { role: "system", content: "You write authentic, concise customer reviews for local cafés and restaurants." },
            { role: "user", content: prompt },
          ],
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`AI provider responded ${res.status}`);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error("AI provider returned empty text");
      return text.replace(/^"|"$/g, "");
    } finally {
      clearTimeout(timeout);
    }
  }
}
