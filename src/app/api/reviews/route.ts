import { db } from "@/db";
import { reviews } from "@/db/schema";
import { json, resolveClient, str } from "@/server/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const client = await resolveClient(body?.clientSlug, body?.clientId);
  if (client instanceof Response) return client;

  const generatedText = str(body?.generatedText, 4000);
  if (!generatedText) return json({ ok: false, error: "Missing review text" }, 400);
  const s = body?.submission ?? {};

  try {
    await db.insert(reviews).values({
      clientId: client.id,
      overallRating: str(s.overallRating, 40),
      staffRating: str(s.staffRating, 40),
      serviceRating: str(s.serviceRating, 40),
      selectedItems: Array.isArray(s.selectedItems) ? s.selectedItems.filter((x: unknown) => typeof x === "string").slice(0, 20) : [],
      generatedText,
      tableNumber: str(s.tableNumber, 12),
      location: str(s.location, 32),
      customerId: str(body?.customerId, 64),
    });
    return json({ ok: true });
  } catch {
    return json({ ok: false, error: "Failed to save review" }, 500);
  }
}
