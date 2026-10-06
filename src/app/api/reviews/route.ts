import { json, resolveClient, str } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/reviews — Firebase-only compatibility endpoint.
 *
 * Review activity is written to Firestore by the Customer App itself
 * (`clients/{clientId}/reviews`, see src/services/firebase/reviewService.ts) and
 * Firestore is the source of truth. This route only exists for bundled demo
 * tenants that are not Firestore tenants (hybrid fallback), where the browser
 * SDK write is not permitted by the published rules.
 *
 * It validates and acknowledges the record and NEVER touches a database: no
 * PostgreSQL, no Drizzle, no DATABASE_URL — so the route (and therefore the
 * whole Vercel build) works with zero database configuration.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const client = await resolveClient(body?.clientSlug, body?.clientId);
  if (client instanceof Response) return client;

  const generatedText = str(body?.generatedText, 4000);
  if (!generatedText) return json({ ok: false, error: "Missing review text" }, 400);

  console.warn(`[reviews] Firestore is the source of truth and the demo tenant "${client.id}" is not a Firestore client — review accepted but not persisted.`);

  return json({ ok: true, stored: false, backend: "firebase" }, 202);
}
