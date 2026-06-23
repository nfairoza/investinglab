"use client";

import useSWR from "swr";
import { Landmark, AlertTriangle, CheckCircle2 } from "lucide-react";

interface AdminStatus {
  configured: boolean;
  env: string;
  used: number;
  cap: number;
  nearCap: boolean;
  atCap: boolean;
}

const fetchJson = (u: string) => fetch(u).then((r) => r.json());

// Admin-only read-only Plaid status: configured/env + app-wide connection usage.
// No key fields are ever shown or editable — keys live in env only.
export function PlaidAdminStatus() {
  const { data } = useSWR<AdminStatus>("/api/plaid/admin-status", fetchJson, { revalidateOnFocus: false });
  if (!data) return null;

  const pct = data.cap > 0 ? Math.min(100, Math.round((data.used / data.cap) * 100)) : 0;
  const tone = data.atCap ? "rose" : data.nearCap ? "amber" : "emerald";
  const barColor = tone === "rose" ? "bg-rose-500" : tone === "amber" ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="rounded-xl border border-hairline bg-black/15 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Landmark size={16} className="text-brand-400" />
          <span className="text-sm font-medium text-ink">Plaid (banking)</span>
          {data.configured ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">
              <CheckCircle2 size={11} /> Configured
            </span>
          ) : (
            <span className="rounded-full border border-hairline-strong px-2 py-0.5 text-[11px] text-ink-dim">Not configured</span>
          )}
          <span className="rounded-full border border-hairline-strong px-2 py-0.5 text-[11px] uppercase tracking-wide text-ink-dim">{data.env}</span>
        </div>
        <span className="text-sm font-semibold text-ink">{data.used}/{data.cap} used</span>
      </div>

      <div className="h-1.5 overflow-hidden rounded bg-surface-raised">
        <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>

      {data.atCap ? (
        <p className="flex items-center gap-1.5 text-xs text-rose-300">
          <AlertTriangle size={13} /> Connection limit reached — upgrade your Plaid plan to add more. Existing connections keep working.
        </p>
      ) : data.nearCap ? (
        <p className="flex items-center gap-1.5 text-xs text-amber-300">
          <AlertTriangle size={13} /> Approaching the connection limit ({data.used}/{data.cap}).
        </p>
      ) : (
        <p className="text-[11px] text-ink-faint">
          Connections count Items ever created across all users — removing one does not free a slot on the Trial plan. Keys are env-only (never shown here).
        </p>
      )}
    </div>
  );
}
