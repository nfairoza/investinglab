"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetchJson } from "@/lib/fetch-json";

interface DeliveryRow {
  id: string; alert_id: string | null; user_id: string; severity: number;
  triggered_at: string; push_sent_at: string | null; push_seen_at: string | null; email_sent_at: string | null;
  outcomes: Record<string, unknown> | null; payload: { title?: string; body?: string } | null;
}

// ALERTDEL admin spot-check — recent alert deliveries with push/email outcomes.
export function AdminDeliveries() {
  const [userId, setUserId] = useState("");
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  const { data, error, isLoading, mutate } = useSWR<{ rows: DeliveryRow[] }>(`/api/admin/deliveries${qs}`, fetchJson, { revalidateOnFocus: false });
  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="Filter by user id (optional)"
          className="w-72 rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-ink-faint" />
        <button onClick={() => mutate()} className="rounded-md border border-hairline px-3 py-1.5 text-sm text-ink-dim hover:bg-surface hover:text-ink">Refresh</button>
      </div>

      {isLoading ? <p className="text-sm text-ink-faint">Loading…</p>
       : error ? <p className="text-sm text-rose-400">Failed to load deliveries.</p>
       : rows.length === 0 ? <p className="text-sm text-ink-faint">No deliveries yet.</p>
       : (
        <div className="overflow-x-auto rounded-xl glass">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-hairline text-[10px] uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="px-3 py-2">Triggered</th>
                <th className="px-3 py-2">Sev</th>
                <th className="px-3 py-2">Alert</th>
                <th className="px-3 py-2">Push</th>
                <th className="px-3 py-2">Seen</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Outcomes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {rows.map((r) => (
                <tr key={r.id} className="text-ink-dim">
                  <td className="whitespace-nowrap px-3 py-2">{new Date(r.triggered_at).toLocaleString()}</td>
                  <td className="px-3 py-2">{r.severity === 3 ? <span className="text-rose-400">3</span> : "1"}</td>
                  <td className="px-3 py-2 text-ink">{r.payload?.title ?? "—"}</td>
                  <td className="px-3 py-2">{r.push_sent_at ? "✓" : "—"}</td>
                  <td className="px-3 py-2">{r.push_seen_at ? "✓" : <span className="text-ink-faint">unseen</span>}</td>
                  <td className="px-3 py-2">{r.email_sent_at ? "✓" : "—"}</td>
                  <td className="px-3 py-2 font-mono text-[10px] text-ink-faint">{r.outcomes ? JSON.stringify(r.outcomes) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
