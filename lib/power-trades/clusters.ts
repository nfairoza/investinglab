// =============================================================================
// PT5 — insider cluster detection (Form 4).
//
// A "cluster" = ≥3 DISTINCT insiders making open-market PURCHASES (Form 4 code P
// → our transaction_type "buy") of the SAME issuer within a rolling 30-day
// window. Multiple independent insiders buying is the strongest-studied insider
// signal; option exercises and planned 10b5-1 sales are excluded upstream (they
// map to "option"/"sell", never "buy").
//
// Pure + deterministic so it can be golden-tested; the nightly job feeds it the
// recent Form-4 buys and persists the detected clusters.
// =============================================================================

const WINDOW_DAYS = 30;
const MIN_INSIDERS = 3;
const DAY_MS = 86_400_000;

export interface InsiderBuy {
  issuer: string; // ticker
  insider: string; // person name (distinct-insider key)
  date: string; // transaction date YYYY-MM-DD
  value: number | null; // dollar value (amount_max or estimate), for the combined total
  tradeId: string;
}

export interface InsiderCluster {
  issuer: string;
  windowStart: string; // earliest buy date in the cluster
  windowEnd: string; // latest buy date in the cluster
  insiderCount: number; // distinct insiders
  insiders: string[];
  totalValue: number;
  tradeIds: string[];
}

function toDay(d: string): string | null {
  const s = String(d).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * Detect clusters among a set of insider buys. Groups by issuer, then slides a
 * 30-day window over each issuer's buys (sorted by date); a window with ≥3
 * DISTINCT insiders is a cluster. Returns at most one cluster per issuer — the
 * densest recent window (latest window meeting the threshold), to avoid emitting
 * overlapping duplicates for the same run of buying.
 */
export function detectClusters(buys: InsiderBuy[]): InsiderCluster[] {
  const byIssuer = new Map<string, InsiderBuy[]>();
  for (const b of buys) {
    const day = toDay(b.date);
    const issuer = (b.issuer || "").toUpperCase();
    if (!day || !issuer || !b.insider) continue;
    (byIssuer.get(issuer) ?? byIssuer.set(issuer, []).get(issuer)!).push({ ...b, date: day });
  }

  const clusters: InsiderCluster[] = [];
  for (const [issuer, list] of byIssuer) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    let best: InsiderCluster | null = null;
    // Anchor the window at each buy; include all buys within the next 30 days.
    for (let i = 0; i < sorted.length; i++) {
      const startMs = Date.parse(sorted[i].date + "T00:00:00Z");
      const inWindow = sorted.filter((b) => {
        const t = Date.parse(b.date + "T00:00:00Z");
        return t >= startMs && t <= startMs + WINDOW_DAYS * DAY_MS;
      });
      const insiders = Array.from(new Set(inWindow.map((b) => b.insider)));
      if (insiders.length >= MIN_INSIDERS) {
        const candidate: InsiderCluster = {
          issuer,
          windowStart: inWindow[0].date,
          windowEnd: inWindow[inWindow.length - 1].date,
          insiderCount: insiders.length,
          insiders,
          totalValue: inWindow.reduce((s, b) => s + (Number(b.value) || 0), 0),
          tradeIds: inWindow.map((b) => b.tradeId),
        };
        // Prefer the window with more distinct insiders; tie → the later one.
        if (!best || candidate.insiderCount > best.insiderCount || candidate.windowEnd > best.windowEnd) {
          best = candidate;
        }
      }
    }
    if (best) clusters.push(best);
  }
  // Most insiders first.
  return clusters.sort((a, b) => b.insiderCount - a.insiderCount || b.totalValue - a.totalValue);
}
