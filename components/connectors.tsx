"use client";

import { useEffect, useState } from "react";
import { CONNECTORS, type Connector } from "@/lib/connectors/registry";

type Stat = { id: string; configured: boolean; source: "runtime" | "env" | "none" };

function ConnectorCard({ connector, stat, onChanged }: { connector: Connector; stat?: Stat; onChanged: () => void }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await fetch("/api/connectors/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectorId: connector.id, values: vals }),
      });
      setVals({});
      setMsg("Saved for this session.");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    setMsg(null);
    try {
      await fetch("/api/connectors/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectorId: connector.id, clear: true }),
      });
      setMsg("Cleared.");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    if (!connector.testUrl) return;
    setBusy(true);
    setMsg("Testing…");
    try {
      const r = await fetch(connector.testUrl);
      const d = (await r.json()) as { source?: string; note?: string; error?: string };
      if (d.error) {
        setMsg(`Error: ${d.error}`);
      } else if (d.source === "live") {
        setMsg("Live data working ✓");
      } else if (d.source === "demo") {
        setMsg("Still demo — key not detected yet.");
      } else if (d.source === "unavailable") {
        setMsg(`Unavailable: ${d.note ?? "no data"}`);
      } else {
        setMsg("Responded ✓");
      }
    } catch (e) {
      setMsg(`Test failed: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setBusy(false);
    }
  }

  const hasInput = connector.fields.some((f) => (vals[f.id] ?? "").trim());

  return (
    <div className="card-hover rounded-xl glass p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-ink">{connector.label}</span>
        {/* Status line — same style as the Claude card */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-ink-faint">Status:</span>
          {stat?.configured ? (
            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">
              Configured ({stat.source === "env" ? "from environment" : "this session"})
            </span>
          ) : (
            <span className="rounded-full border border-hairline-strong bg-surface px-2 py-0.5 text-[11px] text-ink-dim">
              Not set
            </span>
          )}
        </div>
      </div>
      <p className="mt-1 text-sm text-ink-dim">{connector.purpose}</p>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {connector.fields.map((f) => (
          <input
            key={f.id}
            type={f.secret ? "password" : "text"}
            value={vals[f.id] ?? ""}
            onChange={(e) => setVals((v) => ({ ...v, [f.id]: e.target.value }))}
            placeholder={f.placeholder ?? f.label}
            className="rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none"
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={save} disabled={busy || !hasInput} className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50">
          Save
        </button>
        {connector.testUrl && (
          <button onClick={test} disabled={busy} className="rounded-md border border-hairline px-3 py-1.5 text-sm text-ink hover:bg-surface-raised disabled:opacity-50">
            Test
          </button>
        )}
        <button onClick={onChanged} disabled={busy} className="rounded-md border border-hairline px-3 py-1.5 text-sm text-ink-dim hover:bg-surface-raised disabled:opacity-50">
          Refresh
        </button>
        {stat?.source === "runtime" && (
          <button onClick={clear} disabled={busy} className="rounded-md border border-hairline px-3 py-1.5 text-sm text-ink-dim hover:bg-surface-raised disabled:opacity-50">
            Clear
          </button>
        )}
        {connector.helpUrl && (
          <a href={connector.helpUrl} target="_blank" rel="noreferrer" className="text-xs text-brand-400 underline">
            Get a key
          </a>
        )}
        {msg && <span className="text-sm text-ink-dim">{msg}</span>}
      </div>
    </div>
  );
}

interface FmpHealthData { lastSuccess: string | null; lastError: string | null; lastErrorAt: string | null; callsToday: number }

// Provider-health strip (P3.3): last success, last error, today's FMP call count
// (network calls only — cache hits excluded). Admin-only endpoint; renders
// nothing for non-admins or when unavailable.
function ProviderHealthStrip() {
  const [h, setH] = useState<FmpHealthData | null>(null);
  const [show, setShow] = useState(false);

  async function load() {
    try {
      const r = await fetch("/api/connectors/health");
      if (!r.ok) return; // non-admin (403) or not configured — hide silently
      const j = (await r.json()) as { fmp?: FmpHealthData };
      if (j.fmp) { setH(j.fmp); setShow(true); }
    } catch { /* hide */ }
  }
  useEffect(() => { load(); }, []);

  if (!show || !h) return null;
  const rel = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString() : "—");
  return (
    <div className="rounded-lg border border-hairline bg-surface p-3 text-xs">
      <div className="mb-2 font-medium text-ink">Provider health · FMP (this server instance)</div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-ink-dim">
        <span>Last success: <span className="text-ink">{rel(h.lastSuccess)}</span></span>
        <span>Calls today: <span className="text-ink">{h.callsToday}</span></span>
        <span>Last error: {h.lastError ? <span className="text-rose-400">{h.lastError} @ {rel(h.lastErrorAt)}</span> : <span className="text-emerald-400">none</span>}</span>
      </div>
      <p className="mt-1 text-[10px] text-ink-faint">Best-effort, per serverless instance — resets on cold start. Cache hits aren&apos;t counted.</p>
    </div>
  );
}

export function Connectors() {
  const [stats, setStats] = useState<Record<string, Stat>>({});

  async function refresh() {
    try {
      const r = await fetch("/api/connectors/status");
      const j = (await r.json()) as { connectors: Stat[] };
      setStats(Object.fromEntries(j.connectors.map((c) => [c.id, c])));
    } catch {
      setStats({});
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  const finance = CONNECTORS.filter((c) => c.category === "finance");
  const other = CONNECTORS.filter((c) => c.category === "other");

  return (
    <div className="space-y-8">
      <ProviderHealthStrip />

      {finance.length > 0 && (
        <section className="space-y-3">
          <SectionHeading title="Finance data" subtitle="Market data, news, and filings that feed research, scoring, and charts." />
          {finance.map((c) => (
            <ConnectorCard key={c.id} connector={c} stat={stats[c.id]} onChanged={refresh} />
          ))}
        </section>
      )}

      {other.length > 0 && (
        <section className="space-y-3">
          <SectionHeading title="Other" subtitle="Optional sources." />
          {other.map((c) => (
            <ConnectorCard key={c.id} connector={c} stat={stats[c.id]} onChanged={refresh} />
          ))}
        </section>
      )}

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-relaxed text-amber-200/90">
        <span className="font-medium">Where keys live.</span> Keys you save here are stored encrypted on the
        server (AES-256-GCM) and persist across restarts — never in the browser, never committed. Keys set
        via <code className="rounded bg-surface-raised px-1">.env.local</code> / hosting env vars still work
        and show as <span className="text-amber-100">from environment</span>.
      </div>
    </div>
  );
}

export function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="border-b border-hairline pb-2">
      <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-ink-faint">{subtitle}</p>}
    </div>
  );
}

// Exported so the connectors page can render AI providers (Claude card + Gemini)
// under one "AI providers" heading.
export function ConnectorList({ category }: { category: "ai" | "finance" | "other" }) {
  const [stats, setStats] = useState<Record<string, Stat>>({});
  async function refresh() {
    try {
      const r = await fetch("/api/connectors/status");
      const j = (await r.json()) as { connectors: Stat[] };
      setStats(Object.fromEntries(j.connectors.map((c) => [c.id, c])));
    } catch { setStats({}); }
  }
  useEffect(() => { refresh(); }, []);
  return (
    <div className="space-y-3">
      {CONNECTORS.filter((c) => c.category === category).map((c) => (
        <ConnectorCard key={c.id} connector={c} stat={stats[c.id]} onChanged={refresh} />
      ))}
    </div>
  );
}
