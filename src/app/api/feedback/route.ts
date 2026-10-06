import { json, resolveClient, str } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/feedback — Firebase-only compatibility endpoint.
 *
 * The Customer App writes feedback straight to Firestore
 * (`clients/{clientId}/feedback`, see src/services/firebase/feedbackService.ts)
 * and Firestore is the source of truth. This route only serves bundled demo
 * tenants that are not Firestore tenants (hybrid/offline fallback), where the
 * browser SDK write is not permitted by the published rules.
 *
 * It validates and acknowledges the submission and NEVER touches a database:
 * no PostgreSQL, no Drizzle, no DATABASE_URL — so the route (and therefore the
 * whole Vercel build) works with zero database configuration.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const client = await resolveClient(body?.clientSlug, body?.clientId);
  if (client instanceof Response) return client;

  const message = str(body?.message, 2000);
  if (!message || message.length < 3) return json({ ok: false, error: "Message is required" }, 400);

  const rating = typeof body?.rating === "number" && Number.isInteger(body.rating) && body.rating >= 1 && body.rating <= 5 ? body.rating : null;
  console.warn(
    `[feedback] Firestore is the source of truth and the demo tenant "${client.id}" is not a Firestore client — submission accepted but not persisted (rating: ${rating ?? "none"}).`
  );

  return json({ ok: true, stored: false, backend: "firebase" }, 202);
}
