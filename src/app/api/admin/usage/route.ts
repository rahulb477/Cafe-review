import { isAdminEnabled } from "@/config/platform";
import { isRealAIConfigured } from "@/server/ai";
import { listUsage } from "@/server/ai/usage";
import { json } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/usage — AI Review usage for the developer console.
 *
 * FIREBASE-ONLY (Customer App): tenants are resolved from Firestore via
 * `clientService` and the counters come from the in-process tracker in
 * `src/server/ai/usage.ts`.
 *
 * This route deliberately imports NO SQL layer — there is no Drizzle/PostgreSQL
 * client in this project, so the route can be imported (and page data
 * collected) during a Vercel build without DATABASE_URL being set.
 */
export async function GET() {
  if (!isAdminEnabled()) return json({ ok: false }, 404);
  try {
    return json({
      ok: true,
      realAIConfigured: isRealAIConfigured(),
      /** Where the counters come from — surfaced so the console can explain it. */
      usageStore: "memory",
      usage: listUsage(),
    });
  } catch {
    return json({ ok: false, error: "Failed to load usage" }, 500);
  }
}
