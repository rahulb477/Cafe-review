import { json, resolveClient } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/wifi?client=<slug>
 * Password is read server-side from WIFI_PASSWORD_<SLUG> (e.g. WIFI_PASSWORD_SHARMA_CAFE)
 * and only used to build a join URI — it is never part of the JS bundle.
 */
export async function POST(req: Request) {
  const client = await resolveClient(new URL(req.url).searchParams.get("client"));
  if (client instanceof Response) return client;
  if (!client.wifi.enabled || !client.wifi.ssid) return json({ ok: false, message: "Wi-Fi isn't available here." }, 404);

  const ssid = client.wifi.ssid;
  const envKey = `WIFI_PASSWORD_${client.slug.toUpperCase().replace(/-/g, "_")}`;
  const password = process.env[envKey] || "";
  const esc = (v: string) => v.replace(/([\\;,:"])/g, "\\$1");
  const joinUri = `WIFI:T:${password ? "WPA" : "nopass"};S:${esc(ssid)};${password ? `P:${esc(password)};` : ""};`;

  return json({
    ok: true,
    joinUri,
    message: password
      ? `You're all set to join "${ssid}". Open your Wi-Fi settings to confirm, or ask our staff for the password.`
      : `Select "${ssid}" from your Wi-Fi settings to connect. It's free and open!`,
  });
}
