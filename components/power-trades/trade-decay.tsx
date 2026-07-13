// PT1 — signal-decay honesty display helpers, shared by every trade row.
// Pure formatting over the returns fields the trades API now embeds. Color-
// neutral for lag (it's context, not judgment); green/red only for the actual
// price move, which IS directional.

export interface TradeDecayFields {
  transaction_date?: string | null;
  disclosure_date?: string | null;
  lag_days?: number | null;
  since_trade_pct?: number | null;
  since_disclosure_pct?: number | null;
  return_as_of?: string | null;
}

export function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

function pctCls(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "text-ink-faint";
  if (v > 0) return "text-emerald-300";
  if (v < 0) return "text-rose-300";
  return "text-ink-dim";
}

// "Traded Jun 3 · Disclosed Jul 8 (35d lag)" — the disclosure-lag line.
export function LagLine({ t }: { t: TradeDecayFields }) {
  const traded = t.transaction_date ? new Date(t.transaction_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;
  const disclosed = t.disclosure_date ? new Date(t.disclosure_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;
  if (!traded && !disclosed) return <span className="text-ink-faint">—</span>;
  return (
    <span className="text-ink-faint">
      {traded ? `Traded ${traded}` : ""}
      {traded && disclosed ? " · " : ""}
      {disclosed ? `Disclosed ${disclosed}` : ""}
      {t.lag_days != null ? <span className="ml-1 rounded bg-surface px-1 py-0.5 text-[10px] text-ink-dim">{t.lag_days}d lag</span> : null}
    </span>
  );
}

// "+12.4% since trade · +3.1% since disclosure" — the since-move line.
export function SinceMove({ t }: { t: TradeDecayFields }) {
  const hasTrade = t.since_trade_pct != null && Number.isFinite(t.since_trade_pct);
  const hasDisc = t.since_disclosure_pct != null && Number.isFinite(t.since_disclosure_pct);
  if (!hasTrade && !hasDisc) return <span className="text-ink-faint">—</span>;
  return (
    <span className="tabular-nums">
      {hasTrade && <span className={pctCls(t.since_trade_pct)}>{fmtPct(t.since_trade_pct)} <span className="text-ink-faint">since trade</span></span>}
      {hasTrade && hasDisc && <span className="text-ink-faint"> · </span>}
      {hasDisc && <span className={pctCls(t.since_disclosure_pct)}>{fmtPct(t.since_disclosure_pct)} <span className="text-ink-faint">since disclosure</span></span>}
    </span>
  );
}
