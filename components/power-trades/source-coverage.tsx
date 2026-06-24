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
          SEC Form 4 (EDGAR) corporate-insider trades are built — an admin enables them with
          <span className="text-ink-dim"> POWER_TRADES_ENABLE_SEC_FORM4</span> +
          <span className="text-ink-dim"> SEC_USER_AGENT</span>. Executive / OGE is built as a
          <span className="text-ink-dim"> partial · curated</span> source (a few high-profile officials linked to
          real OGE documents, plus admin manual entry of 278-T transactions with required source links) — enable with
          <span className="text-ink-dim"> POWER_TRADES_ENABLE_EXECUTIVE</span>. It is not comprehensive; use the
          <a href="https://www.oge.gov/" target="_blank" rel="noreferrer" className="text-brand-400 hover:underline"> OGE public disclosure search</a> for full lookups.
          FEC is built as <span className="text-ink-dim">influence context (not trades)</span> — campaign-finance
          money, shown only in the Influence Context tab, never in the Alpha Feed and never scored. Enable with
          <span className="text-ink-dim"> POWER_TRADES_ENABLE_FEC</span> +
          <span className="text-ink-dim"> FEC_API_KEY</span>. No individual donor addresses; FEC contributor lists
          are non-commercial use only. <span className="text-ink-dim">OpenSecrets discontinued its public API on
          2025-04-15</span>, so lobbying context is unavailable (a commercial agreement would be required to revive
          it). Quiver is an optional future add.
        </p>
      </div>
    </div>
  );
}
