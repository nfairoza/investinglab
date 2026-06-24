"use client";

import React, { useMemo, useState } from "react";
import useSWR from "swr";
import { Search, RefreshCw, Trash2, AlertTriangle } from "lucide-react";

interface ErrorRow {
  id: string;
  user_id: string | null;
  user_email: string | null;
  category: string;
  section: string | null;
  message: string;
  status_code: number | null;
  path: string | null;
  severity: string;
  meta: Record<string, unknown> | null;
  created_at: string;
}
interface Resp { rows: ErrorRow[]; total: number; categories: string[]; error?: string }

const fetchJson = (u: string) => fetch(u).then((r) => r.json());

const CAT_CLS: Record<string, string> = {
  ai: "border-violet-500/40 bg-violet-500/10 text-violet-300",
  market_data: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  plaid: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  auth: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  app: "border-hairline bg-surface text-ink-dim",
  other: "border-hairline bg-surface text-ink-dim",
};
const CAT_LABEL: Record<string, string> = {
  ai: "AI", market_data: "Market data", plaid: "Plaid", auth: "Auth", app: "App", other: "Other",
};

export function AdminErrors() {
  const [category, setCategory] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (category !== "all") p.set("category", category);
    if (severity !== "all") p.set("severity", severity);
    if (q.trim()) p.set("q", q.trim());
    if (from) p.set("from", new Date(from).toISOString());
    if (to) p.set("to", new Date(to + "T23:59:59").toISOString());
    p.set("limit", "200");
    return p.toString();
  }, [category, severity, q, from, to]);

  const { data, isLoading, mutate } = useSWR<Resp>(`/api/admin/errors?${qs}`, fetchJson, { revalidateOnFocus: false, keepPreviousData: true });
  const rows = data?.rows ?? [];
  const categories = ["all", ...(data?.categories ?? [])];

  async function clearOne(id: string) {
    await fetch(`/api/admin/errors?id=${id}`, { method: "DELETE" });
    mutate();
  }
  async function clearAll() {
    if (!confirm("Clear ALL logged errors? This cannot be undone.")) return;
    await fetch(`/api/admin/errors?all=1`, { method: "DELETE" });
    mutate();
  }

  const select = "rounded-lg border border-hairline px-3 py-2 text-sm text-ink focus:outline-none";
  const selectStyle = { background: "var(--surface-solid)", color: "var(--text)" } as const;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="rounded-2xl glass p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-[11px] uppercase tracking-wide text-ink-faint">Search</span>
            <div className="flex items-center gap-2 rounded-lg border border-hairline bg-surface px-3 py-2">
              <Search size={15} className="text-ink-faint" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="message, user, section…"
                className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none" />
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wide text-ink-faint">Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${select} w-full`} style={selectStyle}>
              {categories.map((c) => <option key={c} value={c}>{c === "all" ? "All" : CAT_LABEL[c] ?? c}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wide text-ink-faint">Severity</span>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} className={`${select} w-full`} style={selectStyle}>
              <option value="all">All</option>
              <option value="error">Error</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-ink-faint">From</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${select} w-full`} style={selectStyle} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-ink-faint">To</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${select} w-full`} style={selectStyle} />
            </label>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-ink-faint">{data?.total ?? 0} total · showing {rows.length}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => mutate()} className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1 text-xs text-ink-dim hover:bg-surface hover:text-ink">
              <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} /> Refresh
            </button>
            {rows.length > 0 && (
              <button onClick={clearAll} className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/40 px-2.5 py-1 text-xs text-rose-300 hover:bg-rose-500/10">
                <Trash2 size={12} /> Clear all
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      {data?.error ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200">
          Couldn&apos;t load errors: {data.error}. Make sure migration 0011_error_log.sql is applied and SUPABASE_SECRET_KEY is set.
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-hairline bg-surface p-8 text-center text-sm text-ink-dim">
          <AlertTriangle size={22} className="mx-auto text-emerald-400" />
          <p className="mt-2">No errors logged for these filters. That&apos;s a good thing.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-hairline">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Section</th>
                <th className="px-3 py-2">Message</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r) => (
                <React.Fragment key={r.id}>
                  <tr className="cursor-pointer align-top hover:bg-surface" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                    <td className="whitespace-nowrap px-3 py-2 text-[11px] text-ink-faint">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2 text-xs text-ink-dim">{r.user_email ?? <span className="text-ink-faint">—</span>}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${CAT_CLS[r.category] ?? CAT_CLS.other}`}>{CAT_LABEL[r.category] ?? r.category}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-ink-dim">{r.section ?? "—"}{r.status_code ? ` · ${r.status_code}` : ""}</td>
                    <td className="max-w-md px-3 py-2 text-xs text-ink-dim">
                      <span className={expanded === r.id ? "" : "line-clamp-2"}>{r.message}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={(e) => { e.stopPropagation(); clearOne(r.id); }} className="text-ink-faint hover:text-rose-400" title="Delete"><Trash2 size={13} /></button>
                    </td>
                  </tr>
                  {expanded === r.id && (
                    <tr className="bg-black/15">
                      <td colSpan={6} className="px-3 py-3">
                        <div className="space-y-1 text-xs text-ink-dim">
                          {r.path && <div><span className="text-ink-faint">Path:</span> {r.path}</div>}
                          <div className="whitespace-pre-wrap rounded-lg border border-hairline bg-surface p-2 font-mono text-[11px] text-ink-dim">{r.message}</div>
                          {r.meta && <pre className="overflow-x-auto rounded-lg border border-hairline bg-surface p-2 text-[11px]">{JSON.stringify(r.meta, null, 2)}</pre>}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
