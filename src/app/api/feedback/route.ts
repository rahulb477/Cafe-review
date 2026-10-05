import { db } from "@/db";
import { feedback } from "@/db/schema";
import { json, resolveClient, str } from "@/server/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const client = await resolveClient(body?.clientSlug, body?.clientId);
  if (client instanceof Response) return client;

  const message = str(body?.message, 2000);
  if (!message || message.length < 3) return json({ ok: false, error: "Message is required" }, 400);
  const rating = typeof body?.rating === "number" && body.rating >= 1 && body.rating <= 5 ? Math.round(body.rating) : null;

  try {
    await db.insert(feedback).values({
      clientId: client.id,
      message,
      rating,
      tableNumber: str(body?.tableNumber, 12),
      location: str(body?.location, 32),
    });
    return json({ ok: true });
  } catch {
    return json({ ok: false, error: "Failed to save feedback" }, 500);
  }
}
