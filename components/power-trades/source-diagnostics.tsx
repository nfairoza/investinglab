"use client";

import { useState } from "react";
import useSWR from "swr";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { ManualExecutiveEntry } from "./manual-executive-entry";

interface Diag {
  provider: string; fmpKeyConfigured: boolean;
  registry: { source: string; label: string; built: boolean; enabled: boolean }[];
  totals: { trades: number; people: number };
  rowsBySource: Record<string, number>;
  chambers: Record<string, number>;
  missingTicker: number; parserFailures: number;
  executive?: { officials: number; records: number; recordsWithSource: number; recordsWithoutSource: number; lastUpdate: string | null };
  influence?: { fecKeyConfigured: boolean; openSecretsKeyConfigured: boolean; fecRecords: number; openSecretsRecords: number; recordsWithoutSource: number };
  topUnmapped: { name: string; count: number }[];
  sources: { source: string; last_sync_at: string | null; last_error: string | null }[];
  runs: { id: string; source: string; started_at: string; finished_at: string | null; rows_ingested: number; rows_normalized: number; errors: number; note: string | null }[];
  error?: string;
}
const fetchJson = (u: string) => fetch(u).then((r) => r.json());

// ADMIN ONLY (gated by the parent tab + the API route).
export function SourceDiagnostics() {
  const { data, mutate, isLoading } = useSWR<Diag>("/api/power-trades/diagnostics", fetchJson, { revalidateOnFocus: false });
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  async function runSync() {
    setSyncing(true); setSyncMsg(null);
    try {
      const r = await fetch("/api/power-trades/sync", { method: "POST" });
      const j = await r.json();
      if (j.error) {
        setSyncMsg(`Error: ${j.error}`);
      } else {
        const per = j.sources
          ? Object.entries(j.sources).map(([s, v]: [string, any]) => `${s}: ${v.normalized ?? 0} new${v.note ? ` (${v.note})` : ""}`).join(" · ")
          : "";
        setSyncMsg(`Ingested ${j.ingested}, normalized ${j.normalized}, errors ${j.errors}${per ? ` — ${per}` : ""}`);
      }
      mutate();
    } catch (e) { setSyncMsg(e instanceof Error ? e.message : "sync failed"); }
    finally { setSyncing(false); }
  }

  if (data?.error) return <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200">Diagnostics unavailable: {data.error}. Apply migration 0012_power_trades.sql and set SUPABASE_SECRET_KEY.</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink"><ShieldCheck size={16} className="text-brand-400" /> Source Diagnostics <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] text-ink-faint">admin</span></div>
        <button onClick={runSync} disabled={syncing} className="inline-flex items-center gap-1.5 rounded-md border border-brand-500/50 bg-brand-500/10 px-3 py-1.5 text-xs font-medium text-brand-300 hover:bg-brand-500/20 disabled:opacity-50">
          <RefreshCw size={12} className={syncing ? "animate-spin" : ""} /> {syncing ? "Syncing…" : "Run FMP sync"}
        </button>
      </div>
      {syncMsg && <div className="rounded-lg border border-hairline bg-surface p-2.5 text-xs text-ink-dim">{syncMsg}</div>}

      {data?.executive && (
        <div className="rounded-2xl glass p-5">
          <div className="text-sm font-semibold text-ink">Executive / OGE coverage <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] text-ink-faint">partial · curated</span></div>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Officials curated" value={String(data.executive.officials)} />
            <Stat label="Records" value={String(data.executive.records)} />
            <Stat label="With source link" value={String(data.executive.recordsWithSource)} tone="ok" />
            <Stat label="Missing source" value={String(data.executive.recordsWithoutSource)} tone={data.executive.recordsWithoutSource > 0 ? "bad" : undefined} />
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">
            Last update: {data.executive.lastUpdate ? new Date(data.executive.lastUpdate).toLocaleString() : "never"}.
            Every executive record must carry a verified oge.gov source link; entries without one are rejected.
          </p>
        </div>
      )}

      {data?.influence && (
        <div className="rounded-2xl glass p-5">
          <div className="text-sm font-semibold text-ink">Influence Context coverage <span className="rounded-full border border-sky-500/30 px-2 py-0.5 text-[10px] text-sky-300">FEC · not trades</span></div>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="FEC key" value={data.influence.fecKeyConfigured ? "configured" : "missing"} tone={data.influence.fecKeyConfigured ? "ok" : "bad"} />
            <Stat label="OpenSecrets" value="API ended" tone="warn" />
            <Stat label="FEC records" value={String(data.influence.fecRecords)} />
            <Stat label="OpenSecrets records" value={String(data.influence.openSecretsRecords)} />
            <Stat label="Missing source link" value={String(data.influence.recordsWithoutSource)} tone={data.influence.recordsWithoutSource > 0 ? "bad" : undefined} />
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">
            Campaign-finance + lobbying context, stored separately from trades. Every record carries a source
            link; no individual donor addresses. OpenSecrets is CC BY-NC-SA; both sources are non-commercial.
          </p>
        </div>
      )}

      <ManualExecutiveEntry onAdded={() => mutate()} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Provider" value={data?.provider ?? "—"} />
        <Stat label="FMP key" value={data?.fmpKeyConfigured ? "configured" : "missing"} tone={data?.fmpKeyConfigured ? "ok" : "bad"} />
        <Stat label="Trades" value={String(data?.totals.trades ?? 0)} />
        <Stat label="People" value={String(data?.totals.people ?? 0)} />
        <Stat label="House" value={String(data?.chambers?.house ?? 0)} />
        <Stat label="Senate" value={String(data?.chambers?.senate ?? 0)} />
        <Stat label="Missing ticker" value={String(data?.missingTicker ?? 0)} />
        <Stat label="Parser failures" value={String(data?.parserFailures ?? 0)} tone={(data?.parserFailures ?? 0) > 0 ? "warn" : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl glass p-5">
          <div className="text-sm font-semibold text-ink">Rows by source</div>
          <ul className="mt-2 space-y-1 text-sm">
            {Object.entries(data?.rowsBySource ?? {}).map(([s, n]) => (
              <li key={s} className="flex justify-between text-ink-dim"><span>{s}</span><span>{n}</span></li>
            ))}
            {Object.keys(data?.rowsBySource ?? {}).length === 0 && <li className="text-ink-faint">No rows yet — run a sync.</li>}
          </ul>
        </div>
        <div className="rounded-2xl glass p-5">
          <div className="text-sm font-semibold text-ink">Top unmapped names</div>
          <ul className="mt-2 space-y-1 text-sm">
            {(data?.topUnmapped ?? []).map((u) => (
              <li key={u.name} className="flex justify-between text-ink-dim"><span className="truncate">{u.name}</span><span>{u.count}</span></li>
            ))}
            {(data?.topUnmapped ?? []).length === 0 && <li className="text-ink-faint">None — all rows mapped to a person.</li>}
          </ul>
        </div>
      </div>

      <div className="rounded-2xl glass p-5">
        <div className="text-sm font-semibold text-ink">Recent sync runs</div>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-ink-faint"><tr><th className="py-1 pr-3">Source</th><th className="py-1 pr-3">Started</th><th className="py-1 pr-3">Ingested</th><th className="py-1 pr-3">Normalized</th><th className="py-1 pr-3">Errors</th><th className="py-1">Note</th></tr></thead>
            <tbody className="divide-y divide-white/5 text-ink-dim">
              {(data?.runs ?? []).map((r) => (
                <tr key={r.id}><td className="py-1 pr-3">{r.source}</td><td className="py-1 pr-3">{new Date(r.started_at).toLocaleString()}</td><td className="py-1 pr-3">{r.rows_ingested}</td><td className="py-1 pr-3">{r.rows_normalized}</td><td className="py-1 pr-3">{r.errors}</td><td className="py-1 text-ink-faint">{r.note ?? ""}</td></tr>
              ))}
              {(data?.runs ?? []).length === 0 && <tr><td colSpan={6} className="py-2 text-ink-faint">No sync runs yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl glass p-5">
        <div className="text-sm font-semibold text-ink">Source registry</div>
        <ul className="mt-2 space-y-1 text-sm">
          {(data?.registry ?? []).map((s) => (
            <li key={s.source} className="flex items-center justify-between text-ink-dim">
              <span>{s.label}</span>
              <span className="text-[11px] text-ink-faint">{s.built ? (s.enabled ? "built · enabled" : "built · disabled") : "not built"}</span>
            </li>
          ))}
        </ul>
      </div>
      {isLoading && <p className="text-[11px] text-ink-faint">Loading…</p>}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" | "warn" }) {
  const cls = tone === "ok" ? "text-emerald-400" : tone === "bad" ? "text-rose-400" : tone === "warn" ? "text-amber-400" : "text-ink";
  return (
    <div className="rounded-xl glass px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
