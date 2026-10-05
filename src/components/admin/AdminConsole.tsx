"use client";

import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { ClientConfig } from "@/types/client";
import { validateClientConfig } from "@/services/localClientRepository";
import { generateClientQR, generateTableQR, generateLocationQR } from "@/services/qrService";
import { themeToCssVars } from "@/lib/theme";

interface UsageRow {
  clientId: string;
  month: string;
  requestCount: number;
  successfulRequests: number;
  failedRequests: number;
}

const card = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";

export function AdminConsole({ clients, aiMonthlyPrice }: { clients: ClientConfig[]; aiMonthlyPrice: number }) {
  const [selected, setSelected] = useState(clients[0]?.slug ?? "");
  const client = clients.find((c) => c.slug === selected) ?? clients[0];

  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans text-slate-800">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-xl font-bold">Client Configuration Console</h1>
        <p className="text-sm text-slate-500">Developer-only. Customers never see this page (disabled in production unless ADMIN_ENABLED=true).</p>
      </header>
      <div className="mx-auto grid max-w-6xl gap-6 p-6 lg:grid-cols-[280px_1fr]">
        <aside className={card}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Clients ({clients.length})</h2>
          <ul className="space-y-1">
            {clients.map((c) => {
              const issues = validateClientConfig(c, clients);
              return (
                <li key={c.slug}>
                  <button
                    onClick={() => setSelected(c.slug)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm ${c.slug === selected ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`}
                  >
                    <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: c.theme.primary }} />
                    <span className="flex-1 truncate">{c.businessName}</span>
                    {issues.length > 0 && <span className="rounded bg-amber-400 px-1.5 text-[10px] font-bold text-black">{issues.length}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
        {client && (
          <main className="space-y-6">
            <ClientSummary client={client} />
            <QrGenerator client={client} />
            <ConfigEditor key={client.slug} base={client} />
            <UsagePanel clients={clients} price={aiMonthlyPrice} />
          </main>
        )}
      </div>
    </div>
  );
}

function ClientSummary({ client }: { client: ClientConfig }) {
  const issues = validateClientConfig(client, []);
  const features = [
    ["Wi-Fi", client.wifi.enabled ? client.wifi.ssid : "off"],
    ["Loyalty", client.loyalty.enabled ? `${client.loyalty.stampTarget} → ${client.loyalty.rewardName}` : "off"],
    ["AI Review", client.aiReview.enabled ? `limit ${client.aiReview.monthlyLimit}/mo` : "off (template)"],
    ["Menu", `${client.menu.length} items`],
    ["Socials", Object.entries(client.socialLinks).filter(([, v]) => v).map(([k]) => k).join(", ") || "none"],
    ["Google Review", client.googleReviewUrl ? "configured" : "missing"],
  ];
  return (
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{client.businessName}</h2>
          <p className="text-sm text-slate-500">
            /{client.slug} · id {client.id} · source <b>{client.source}</b>
          </p>
        </div>
        <a href={`/${client.slug}`} target="_blank" rel="noreferrer" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
          Open customer app ↗
        </a>
      </div>
      <dl className="mt-4 grid gap-2 sm:grid-cols-3">
        {features.map(([k, v]) => (
          <div key={k} className="rounded-xl bg-slate-50 px-3 py-2">
            <dt className="text-[11px] uppercase text-slate-500">{k}</dt>
            <dd className="truncate text-sm font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      {issues.length > 0 ? (
        <ul className="mt-4 list-disc space-y-1 rounded-xl bg-amber-50 py-3 pl-8 pr-3 text-sm text-amber-800">
          {issues.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">✓ Configuration valid</p>
      )}
    </section>
  );
}

function QrGenerator({ client }: { client: ClientConfig }) {
  const [mode, setMode] = useState<"client" | "table" | "location">("table");
  const [table, setTable] = useState("1");
  const [location, setLocation] = useState("counter");
  const [origin, setOrigin] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOrigin(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const url = !origin ? "" : mode === "client" ? generateClientQR(client.slug) : mode === "table" ? generateTableQR(client.slug, table || "1") : generateLocationQR(client.slug, location || "counter");

  const download = () => {
    const svg = document.getElementById("admin-qr");
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${client.slug}-${mode === "table" ? `table-${table}` : mode === "location" ? location : "main"}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section className={card}>
      <h2 className="text-lg font-bold">QR Codes</h2>
      <p className="text-sm text-slate-500">URLs use NEXT_PUBLIC_APP_URL (falls back to this browser&apos;s origin).</p>
      <div className="mt-4 flex flex-wrap gap-6">
        <div className="space-y-3">
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1 text-sm">
            {(["client", "table", "location"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`rounded-lg px-3 py-1.5 capitalize ${mode === m ? "bg-white font-semibold shadow" : ""}`}>
                {m}
              </button>
            ))}
          </div>
          {mode === "table" && (
            <label className="block text-sm">
              Table number
              <input value={table} onChange={(e) => setTable(e.target.value.replace(/[^A-Za-z0-9-]/g, "").slice(0, 12))} className="mt-1 block w-40 rounded-lg border border-slate-300 px-3 py-2" />
            </label>
          )}
          {mode === "location" && (
            <label className="block text-sm">
              Location
              <input value={location} onChange={(e) => setLocation(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32))} className="mt-1 block w-40 rounded-lg border border-slate-300 px-3 py-2" />
            </label>
          )}
          <p className="max-w-xs break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs">{url || "…"}</p>
          <button onClick={download} disabled={!url} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            Download SVG
          </button>
        </div>
        <div className="rounded-2xl border border-slate-200 p-3">
          {url ? <QRCodeSVG id="admin-qr" value={url} size={180} level="M" marginSize={2} fgColor={client.theme.primaryDark} /> : <div className="h-[180px] w-[180px] animate-pulse bg-slate-100" />}
        </div>
      </div>
    </section>
  );
}

function ConfigEditor({ base }: { base: ClientConfig }) {
  const [text, setText] = useState(() => JSON.stringify(base, null, 2));
  const [copied, setCopied] = useState(false);
  const parsed = useMemo(() => {
    try {
      return { value: JSON.parse(text) as ClientConfig, error: null as string | null };
    } catch (e) {
      return { value: null, error: e instanceof Error ? e.message : "Invalid JSON" };
    }
  }, [text]);
  const issues = parsed.value ? validateClientConfig(parsed.value) : [];

  const newClient = () => {
    const draft: ClientConfig = {
      ...base,
      id: "client_new_client",
      slug: "new-client",
      businessName: "New Client Cafe",
      displayName: "NEW CLIENT",
      displaySubtitle: "CAFE",
      tagline: "Your tagline here",
      description: "Describe the business.",
      logo: undefined,
      favicon: undefined,
      coverImage: undefined,
      googleReviewUrl: "https://search.google.com/local/writereview?placeid=YOUR_PLACE_ID",
      socialLinks: { instagram: "https://www.instagram.com/your-handle" },
      menu: base.menu.slice(0, 2),
    };
    setText(JSON.stringify(draft, null, 2));
  };

  return (
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Config Editor &amp; Theme Preview</h2>
          <p className="text-sm text-slate-500">
            Edit, validate, then paste into <code className="rounded bg-slate-100 px-1">src/config/clients.ts</code>. No UI changes needed.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={newClient} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold">
            New client template
          </button>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(text).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
          >
            {copied ? "Copied ✓" : "Copy JSON"}
          </button>
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_260px]">
        <textarea
          aria-label="Client configuration JSON"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          className="h-[420px] w-full rounded-xl border border-slate-300 bg-slate-950 p-3 font-mono text-xs text-emerald-200"
        />
        <div className="space-y-3">
          {parsed.value?.theme ? <ThemePreview config={parsed.value} /> : null}
          {parsed.error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">JSON error: {parsed.error}</p>}
          {parsed.value && (issues.length ? (
            <ul className="list-disc space-y-1 rounded-xl bg-amber-50 py-2 pl-6 pr-2 text-xs text-amber-800">
              {issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700">✓ Valid configuration</p>
          ))}
        </div>
      </div>
    </section>
  );
}

function ThemePreview({ config }: { config: ClientConfig }) {
  let style = {};
  try {
    style = themeToCssVars(config.theme);
  } catch {
    /* ignore */
  }
  return (
    <div style={style} className="overflow-hidden rounded-2xl border border-slate-200 bg-canvas">
      <div className="bg-primary-dark px-4 py-3 text-center">
        <p className="font-display text-lg font-bold tracking-widest text-canvas">{config.displayName}</p>
        <p className="text-[9px] tracking-[0.3em] text-canvas/70">{config.displaySubtitle}</p>
      </div>
      <div className="space-y-2 p-3">
        <div className="rounded-2xl bg-surface p-3 shadow">
          <p className="text-xs font-semibold text-primary">
            0 / {config.loyalty?.stampTarget ?? 0} stamps towards a {config.loyalty?.rewardName?.toLowerCase()}
          </p>
          <div className="mt-2 h-2 rounded-full bg-primary/10">
            <div className="h-2 w-1/3 rounded-full bg-accent" />
          </div>
        </div>
        <button className="w-full rounded-2xl bg-button py-2 text-sm font-semibold text-canvas">Primary button</button>
        <button className="w-full rounded-2xl bg-secondary py-2 text-sm font-semibold text-primary">Secondary</button>
        <p className="text-center text-xs text-muted">{config.tagline}</p>
      </div>
    </div>
  );
}

function UsagePanel({ clients, price }: { clients: ClientConfig[]; price: number }) {
  const [data, setData] = useState<{ realAIConfigured: boolean; usage: UsageRow[] } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    fetch("/api/admin/usage")
      .then((r) => r.json())
      .then((d) => (d.ok ? setData(d) : setError(true)))
      .catch(() => setError(true));
  }, []);
  const month = new Date().toISOString().slice(0, 7);

  return (
    <section className={card}>
      <h2 className="text-lg font-bold">AI Review Usage — {month}</h2>
      <p className="text-sm text-slate-500">
        Add-on price: ₹{price}/month per client (billing not connected). Real AI provider:{" "}
        {data ? (data.realAIConfigured ? <b className="text-emerald-600">configured</b> : <b className="text-amber-600">not configured — Mock provider in use</b>) : "…"}
      </p>
      {error && <p className="mt-3 text-sm text-red-600">Couldn&apos;t load usage.</p>}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2">Client</th>
              <th>Requests</th>
              <th>Success</th>
              <th>Failed</th>
              <th>Limit</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => {
              const row = data?.usage.find((u) => u.clientId === c.id && u.month === month);
              return (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="py-2">{c.businessName}</td>
                  <td>{row?.requestCount ?? 0}</td>
                  <td>{row?.successfulRequests ?? 0}</td>
                  <td>{row?.failedRequests ?? 0}</td>
                  <td>{c.aiReview.enabled ? c.aiReview.monthlyLimit : "disabled"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
