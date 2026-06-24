"use client";

import useSWR from "swr";
import { CheckCircle2, Clock } from "lucide-react";

interface SourceStatus { source: string; label: string; built: boolean; enabled: boolean; lastSyncAt: string | null }
const fetchJson = (u: string) => fetch(u).then((r) => r.json());

export function SourceCoverage() {
  const { data } = useSWR<{ sources: SourceStatus[] }>("/api/power-trades/coverage", fetchJson, { revalidateOnFocus: false });
  const sources = data?.sources ?? [];
  const enabled = sources.filter((s) => s.enabled);
  const coming = sources.filter((s) => !s.enabled);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl glass p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink"><CheckCircle2 size={16} className="text-emerald-400" /> Enabled</div>
        {enabled.length === 0 ? (
          <p className="mt-2 text-sm text-ink-dim">No sources enabled yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {enabled.map((s) => (
              <li key={s.source} className="flex items-center justify-between text-sm">
                <span className="text-ink-dim">{s.label}</span>
                <span className="text-[11px] text-ink-faint">{s.lastSyncAt ? `synced ${new Date(s.lastSyncAt).toLocaleString()}` : "not synced yet"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl glass p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Clock size={16} className="text-amber-400" /> Coming</div>
        <ul className="mt-3 space-y-1.5">
          {coming.map((s) => (
            <li key={s.source} className="flex items-center justify-between text-sm">
              <span className="text-ink-dim">{s.label}</span>
              <span className="text-[11px] text-ink-faint">{s.built ? "built · disabled" : "not built"}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-ink-faint">
          SEC Form 4 (EDGAR), Executive/OGE, FEC, and OpenSecrets are planned. Quiver is an optional
          future add. FEC/OpenSecrets are <span className="text-ink-dim">influence context</span> — never rendered as trades.
        </p>
      </div>
    </div>
  );
}
