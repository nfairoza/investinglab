// PT2 — trade markers for the price chart. A marker is a buy/sell disclosure
// plotted at its trade date. Pure helpers: build markers from trade rows and
// align them onto the visible price series (so a marker sits on the line).

export interface ChartMarker {
  date: string; // trade date (YYYY-MM-DD)
  kind: "buy" | "sell";
  band: 0 | 1 | 2; // amount size band → marker radius
  person: string;
  amountLabel: string | null;
  lagDays: number | null;
  sinceTradePct: number | null;
}

export interface TradeForMarker {
  transaction_date?: string | null;
  transaction_type?: string | null;
  amount_max?: number | null;
  amount_label?: string | null;
  person_name?: string | null;
  lag_days?: number | null;
  since_trade_pct?: number | null;
}

// Amount → size band. Congressional bands are wide; three buckets is honest
// enough without implying false precision.
function bandFor(amountMax: number | null | undefined): 0 | 1 | 2 {
  const v = Number(amountMax);
  if (!Number.isFinite(v) || v <= 0) return 0;
  if (v >= 500_000) return 2;
  if (v >= 50_000) return 1;
  return 0;
}

export function bandRadius(band: 0 | 1 | 2): number {
  return band === 2 ? 7 : band === 1 ? 5.5 : 4;
}

// Only buys/sells become markers (holdings/income/exchange are not directional).
export function buildMarkers(trades: TradeForMarker[]): ChartMarker[] {
  const out: ChartMarker[] = [];
  for (const t of trades) {
    const date = t.transaction_date ? String(t.transaction_date).slice(0, 10) : null;
    const type = t.transaction_type;
    if (!date || (type !== "buy" && type !== "sell")) continue;
    out.push({
      date,
      kind: type,
      band: bandFor(t.amount_max),
      person: t.person_name ?? "—",
      amountLabel: t.amount_label ?? null,
      lagDays: t.lag_days ?? null,
      sinceTradePct: t.since_trade_pct ?? null,
    });
  }
  return out;
}

export interface PlacedMarker extends ChartMarker {
  x: string; // the aligned point's date (a real x on the axis)
  y: number; // that point's close
}

// Align each marker to the price point on or just after its trade date so the
// marker lands on the visible line. Markers outside the window are dropped.
export function placeMarkers(markers: ChartMarker[], points: { date: string; close: number }[]): PlacedMarker[] {
  if (points.length === 0) return [];
  const first = points[0].date;
  const last = points[points.length - 1].date;
  const placed: PlacedMarker[] = [];
  for (const m of markers) {
    if (m.date < first || m.date > last) continue;
    let hit: { date: string; close: number } | null = null;
    for (const p of points) {
      if (p.date >= m.date) { hit = p; break; }
    }
    if (hit) placed.push({ ...m, x: hit.date, y: hit.close });
  }
  return placed;
}
