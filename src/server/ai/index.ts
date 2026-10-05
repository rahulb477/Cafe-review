import "server-only";
import { MockAIProvider } from "./mockProvider";
import { RealAIProvider } from "./realProvider";
import type { AIProvider } from "./types";

/**
 * Server-side env (never NEXT_PUBLIC_):
 *   AI_PROVIDER = "openrouter" | "openai" | "mock"
 *   OPENROUTER_API_KEY            → OpenRouter (https://openrouter.ai/api/v1)
 *   AI_API_KEY / OPENAI_API_KEY   → any OpenAI-compatible endpoint
 *   AI_MODEL    (default openai/gpt-4o-mini on OpenRouter, gpt-4o-mini otherwise)
 *   AI_BASE_URL (override endpoint)
 */
export const mockProvider = new MockAIProvider();

export function getRealProvider(): AIProvider | null {
  if ((process.env.AI_PROVIDER ?? "").toLowerCase() === "mock") return null;
  const openrouter = process.env.OPENROUTER_API_KEY;
  if (openrouter) {
    return new RealAIProvider(openrouter, process.env.AI_MODEL || "openai/gpt-4o-mini", process.env.AI_BASE_URL || "https://openrouter.ai/api/v1");
  }
  const key = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new RealAIProvider(key, process.env.AI_MODEL || "gpt-4o-mini", process.env.AI_BASE_URL || "https://api.openai.com/v1");
}

export function isRealAIConfigured(): boolean {
  return getRealProvider() !== null;
}
