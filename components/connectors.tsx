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
        <span className="font-medium text-slate-100">{connector.label}</span>
        {/* Status line — same style as the Claude card */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Status:</span>
          {stat?.configured ? (
            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">
              Configured ({stat.source === "env" ? "from environment" : "this session"})
            </span>
          ) : (
            <span className="rounded-full border border-slate-600 bg-slate-800/40 px-2 py-0.5 text-[11px] text-slate-400">
              Not set
            </span>
          )}
        </div>
      </div>
      <p className="mt-1 text-sm text-slate-400">{connector.purpose}</p>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {connector.fields.map((f) => (
          <input
            key={f.id}
            type={f.secret ? "password" : "text"}
            value={vals[f.id] ?? ""}
            onChange={(e) => setVals((v) => ({ ...v, [f.id]: e.target.value }))}
            placeholder={f.placeholder ?? f.label}
            className="rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-brand-500 focus:outline-none"
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={save} disabled={busy || !hasInput} className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50">
          Save
        </button>
        {connector.testUrl && (
          <button onClick={test} disabled={busy} className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50">
            Test
          </button>
        )}
        <button onClick={onChanged} disabled={busy} className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50">
          Refresh
        </button>
        {stat?.source === "runtime" && (
          <button onClick={clear} disabled={busy} className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-800 disabled:opacity-50">
            Clear
          </button>
        )}
        {connector.helpUrl && (
          <a href={connector.helpUrl} target="_blank" rel="noreferrer" className="text-xs text-brand-400 underline">
            Get a key
          </a>
        )}
        {msg && <span className="text-sm text-slate-400">{msg}</span>}
      </div>
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

  return (
    <div className="space-y-3">
      {CONNECTORS.map((c) => (
        <ConnectorCard key={c.id} connector={c} stat={stats[c.id]} onChanged={refresh} />
      ))}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-relaxed text-amber-200/90">
        <span className="font-medium">Where keys live.</span> Keys you save here are held on your own
        server for this session only — never in the browser, never committed. To make them permanent,
        put them in <code className="rounded bg-slate-800 px-1">.env.local</code> (already done for your
        FMP, Claude, and E*TRADE keys) — those show as <span className="text-amber-100">from environment</span>.
      </div>
    </div>
  );
}
