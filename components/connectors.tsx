"use client";

import { useEffect, useState } from "react";
import { CONNECTORS, type Connector } from "@/lib/connectors/registry";

type Stat = { id: string; configured: boolean; source: "runtime" | "env" | "none" };

function PhaseTag({ phase }: { phase: 1 | 2 | 3 }) {
  const map = { 1: "border-emerald-500/40 text-emerald-300", 2: "border-brand-500/40 text-brand-300", 3: "border-violet-500/40 text-violet-300" } as const;
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] ${map[phase]}`}>Phase {phase}</span>;
}

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
    setBusy(true);
    setMsg("Testing…");
    try {
      const r = await fetch("/api/quote?symbol=AAPL");
      const d = (await r.json()) as { source: string; note?: string };
      setMsg(
        d.source === "live"
          ? "Live data working ✓"
          : d.source === "demo"
            ? "Still demo — key not detected yet."
            : `Unavailable: ${d.note ?? ""}`,
      );
    } finally {
      setBusy(false);
    }
  }

  const hasInput = connector.fields.some((f) => (vals[f.id] ?? "").trim());

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-100">{connector.label}</span>
          <PhaseTag phase={connector.phase} />
        </div>
        {stat?.configured ? (
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">
            Connected ({stat.source === "env" ? "env" : "session"})
          </span>
        ) : (
          <span className="rounded-full border border-slate-600 bg-slate-800/40 px-2 py-0.5 text-[11px] text-slate-400">
            Not connected
          </span>
        )}
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
            className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-brand-500 focus:outline-none"
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={save} disabled={busy || !hasInput} className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">
          Save
        </button>
        {connector.testable && (
          <button onClick={test} disabled={busy} className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50">
            Test
          </button>
        )}
        {stat?.source === "runtime" && (
          <button onClick={clear} disabled={busy} className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-800 disabled:opacity-50">
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
        <span className="font-medium">Security + rollout.</span> Keys saved here are sent to your own
        server and held in memory for this dev session only — never stored in the browser, gone on
        restart. For deployment, set the matching env vars instead. Suggested order:{" "}
        <span className="text-amber-100">Phase 1</span> FMP + SEC (build the scoring/ranking),{" "}
        <span className="text-amber-100">Phase 2</span> Alpaca for live data/trading,{" "}
        <span className="text-amber-100">Phase 3</span> paper trading to test recommendations before real money.
      </div>
    </div>
  );
}
