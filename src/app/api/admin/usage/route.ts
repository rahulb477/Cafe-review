import { desc } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage } from "@/db/schema";
import { isAdminEnabled } from "@/config/platform";
import { json } from "@/server/http";
import { isRealAIConfigured } from "@/server/ai";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isAdminEnabled()) return json({ ok: false }, 404);
  try {
    const rows = await db.select().from(aiUsage).orderBy(desc(aiUsage.month)).limit(200);
    return json({ ok: true, realAIConfigured: isRealAIConfigured(), usage: rows });
  } catch {
    return json({ ok: false, error: "Failed to load usage" }, 500);
  }
}
