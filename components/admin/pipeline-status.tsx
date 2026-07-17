"use client";

import useSWR from "swr";
import { Activity, AlertTriangle } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";

interface JobStatus { id: string; everyMinutes: number; lastRunAt: number | null; dueInMs: number | null; overdue: boolean }
interface PlaidHealth { total: number; active: number; reauthRequired: number; staleOver48h: number; neverSynced: number }
interface PipelineResp { jobs: JobStatus[]; plaid: PlaidHealth; now: number }

function ago(ms: number | null, now: number): string {
  if (ms == null) return "never";
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

// /admin — cron pipeline + Plaid item-sync health. Reads cron:lastrun:${id} per
// job (via /api/admin/pipeline) so an admin can see at a glance whether a job has
// stalled, plus how many linked banks need re-auth or have gone stale.
export function PipelineStatus() {
  const { data } = useSWR<PipelineResp>("/api/admin/pipeline", fetchJson, { revalidateOnFocus: false, refreshInterval: 60_000 });
  if (!data) return null;
  const now = data.now;
  const p = data.plaid;

  return (
    <div className="rounded-2xl glass p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
        <Activity size={16} className="text-brand-400" /> Pipeline status
      </div>

      {/* Plaid sync health summary */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Linked items" value={p.total} />
        <Stat label="Reauth needed" value={p.reauthRequired} tone={p.reauthRequired > 0 ? "amber" : undefined} />
        <Stat label="Stale >48h" value={p.staleOver48h} tone={p.staleOver48h > 0 ? "amber" : undefined} />
        <Stat label="Never synced" value={p.neverSynced} />
      </div>

      {/* Per-job last-run table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-ink-faint">
              <th className="py-1 pr-3 font-medium">Job</th>
              <th className="py-1 pr-3 font-medium">Every</th>
              <th className="py-1 pr-3 font-medium">Last run</th>
              <th className="py-1 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.jobs.map((j) => (
              <tr key={j.id} className="border-t border-hairline/60">
                <td className="py-1.5 pr-3 font-medium text-ink">{j.id}</td>
                <td className="py-1.5 pr-3 text-ink-dim">{fmtEvery(j.everyMinutes)}</td>
                <td className="py-1.5 pr-3 text-ink-dim">{ago(j.lastRunAt, now)}</td>
                <td className="py-1.5">
                  {j.lastRunAt == null ? (
                    <span className="text-ink-faint">—</span>
                  ) : j.overdue ? (
                    <span className="inline-flex items-center gap-1 text-amber-300"><AlertTriangle size={11} /> overdue</span>
                  ) : (
                    <span className="text-emerald-300">ok</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function fmtEvery(minutes: number): string {
  if (minutes % (24 * 60) === 0) return `${minutes / (24 * 60)}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "amber" }) {
  return (
    <div className="rounded-lg border border-hairline bg-surface px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold ${tone === "amber" ? "text-amber-300" : "text-ink"}`}>{value}</div>
    </div>
  );
}
