import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage } from "@/db/schema";

export function currentMonth(d = new Date()): string {
  return d.toISOString().slice(0, 7);
}

export async function getUsage(clientId: string, month = currentMonth()) {
  const [row] = await db.select().from(aiUsage).where(and(eq(aiUsage.clientId, clientId), eq(aiUsage.month, month))).limit(1);
  return row ?? null;
}

/** Atomically records an outcome for the client's current month. */
export async function recordUsage(clientId: string, outcome: "request" | "success" | "failure") {
  const month = currentMonth();
  const inc = {
    requestCount: outcome === "request" ? 1 : 0,
    successfulRequests: outcome === "success" ? 1 : 0,
    failedRequests: outcome === "failure" ? 1 : 0,
  };
  await db
    .insert(aiUsage)
    .values({ clientId, month, ...inc })
    .onConflictDoUpdate({
      target: [aiUsage.clientId, aiUsage.month],
      set: {
        requestCount: sql`${aiUsage.requestCount} + ${inc.requestCount}`,
        successfulRequests: sql`${aiUsage.successfulRequests} + ${inc.successfulRequests}`,
        failedRequests: sql`${aiUsage.failedRequests} + ${inc.failedRequests}`,
        updatedAt: new Date(),
      },
    });
}

/** True if the client may make another real-AI request this month. Fails closed. */
export async function canUseRealAI(clientId: string, monthlyLimit: number): Promise<boolean> {
  try {
    const row = await getUsage(clientId);
    return (row?.requestCount ?? 0) < monthlyLimit;
  } catch {
    return false;
  }
}
