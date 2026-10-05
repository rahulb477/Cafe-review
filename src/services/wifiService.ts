import type { ClientConfig } from "@/types/client";

export interface WifiInfo {
  enabled: boolean;
  ssid: string | null;
  hint: string;
}

export function getWifiInfo(client: ClientConfig): WifiInfo {
  return {
    enabled: client.wifi.enabled && !!client.wifi.ssid,
    ssid: client.wifi.ssid ?? null,
    hint: client.wifi.hint ?? "Enjoy free internet while you're here!",
  };
}

/**
 * Requests a Wi-Fi join string from the server for this client. The password
 * never ships to the browser bundle — it's read from WIFI_PASSWORD_<SLUG>.
 */
export async function requestWifiJoin(clientSlug: string): Promise<{ ok: boolean; joinUri?: string; message: string }> {
  try {
    const res = await fetch(`/api/wifi?client=${encodeURIComponent(clientSlug)}`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) return { ok: false, message: data?.message ?? "Wi-Fi is unavailable right now." };
    return data;
  } catch {
    return {
      ok: false,
      message: "We couldn't connect automatically. Please pick the network from your Wi-Fi settings and ask our staff for help.",
    };
  }
}
