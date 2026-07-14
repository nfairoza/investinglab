// =============================================================================
// PT6 — Portfolio overlap. "People you follow traded stocks you own." Computed
// per user at read time from follows × holdings × recent trades — all local
// tables, zero API cost. Pure + deterministic; the route/generator assembles the
// inputs. Quiver can't copy this: it needs the user's own follows + holdings.
// =============================================================================

export interface OverlapTrade {
  personName: string;
  ticker: string;
  type: "buy" | "sell" | string | null;
  amountLabel: string | null; // shown verbatim — the disclosed band, never a midpoint
  disclosureDate: string | null;
}

export interface OverlapHolding {
  symbol: string;
  value: number; // dollar value the user holds
}

export interface OverlapMatch {
  personName: string;
  ticker: string;
  type: "buy" | "sell";
  amountLabel: string | null;
  disclosureDate: string | null;
  heldValue: number; // what the user holds in that ticker
}

// For each recent trade by a followed person on a ticker the user holds, emit a
// match. Sorted by held value desc (the ones that matter most to the user first),
// then most recent. Only buys/sells (directional) count.
export function computeOverlap(
  followedNames: string[],
  holdings: OverlapHolding[],
  recentTrades: OverlapTrade[],
): OverlapMatch[] {
  const followed = new Set(followedNames.map((n) => n.trim().toLowerCase()).filter(Boolean));
  const heldByTicker = new Map<string, number>();
  for (const h of holdings) {
    const sym = (h.symbol || "").toUpperCase();
    if (sym && h.value > 0) heldByTicker.set(sym, (heldByTicker.get(sym) ?? 0) + h.value);
  }
  if (followed.size === 0 || heldByTicker.size === 0) return [];

  const matches: OverlapMatch[] = [];
  for (const t of recentTrades) {
    if (t.type !== "buy" && t.type !== "sell") continue;
    if (!followed.has((t.personName || "").trim().toLowerCase())) continue;
    const sym = (t.ticker || "").toUpperCase();
    const held = heldByTicker.get(sym);
    if (!held) continue;
    matches.push({
      personName: t.personName,
      ticker: sym,
      type: t.type,
      amountLabel: t.amountLabel,
      disclosureDate: t.disclosureDate,
      heldValue: held,
    });
  }
  return matches.sort((a, b) =>
    b.heldValue - a.heldValue ||
    String(b.disclosureDate ?? "").localeCompare(String(a.disclosureDate ?? "")),
  );
}
