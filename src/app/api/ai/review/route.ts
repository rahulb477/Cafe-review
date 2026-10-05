import { json, resolveClient } from "@/server/http";
import { getRealProvider, mockProvider } from "@/server/ai";
import { canUseRealAI, recordUsage } from "@/server/ai/usage";
import { verifyFirebaseIdToken } from "@/server/firebaseAuth";
import type { ReviewAnswers } from "@/types/review";

export const dynamic = "force-dynamic";

function parseAnswers(a: unknown): ReviewAnswers | null {
  if (!a || typeof a !== "object") return null;
  const o = a as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v.slice(0, 40) : null);
  const items = Array.isArray(o.selectedItems) ? o.selectedItems.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 20).map((x) => x.trim().slice(0, 80)) : [];
  const answers = { overallRating: s(o.overallRating), staffRating: s(o.staffRating), serviceRating: s(o.serviceRating), selectedItems: items };
  return answers.overallRating ? answers : null;
}

/**
 * POST /api/ai/review  { clientSlug, clientId, answers }  (+ optional Firebase ID token)
 * The tenant is resolved server-side from the slug (clientId must match it).
 * Picks RealAIProvider when configured, enabled for the client and under the
 * monthly limit; otherwise MockAIProvider. Usage is tracked per client/month.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const client = await resolveClient(body?.clientSlug, body?.clientId);
  if (client instanceof Response) return client;
  const answers = parseAnswers(body?.answers);
  if (!answers) return json({ ok: false, error: "Invalid answers" }, 400);
  if (!client.aiReview.enabled) {
    // AI add-on disabled for this tenant → template review (no AI cost).
    return json({ text: await mockProvider.generateReview({ client, answers }), provider: mockProvider.name });
  }
  // Optional verified customer identity (never trusted from the request body).
  const customerUid = await verifyFirebaseIdToken(req.headers.get("authorization"));

  const real = getRealProvider();
  const allowed = real && client.aiReview.enabled && (await canUseRealAI(client.id, client.aiReview.monthlyLimit));

  if (real && allowed) {
    try {
      await recordUsage(client.id, "request");
      const text = await real.generateReview({ client, answers });
      await recordUsage(client.id, "success").catch(() => {});
      return json({ text, provider: real.name, verified: !!customerUid });
    } catch {
      await recordUsage(client.id, "failure").catch(() => {});
      // fall through to mock so the customer is never blocked
    }
  }

  const text = await mockProvider.generateReview({ client, answers });
  return json({ text, provider: mockProvider.name, verified: !!customerUid });
}
