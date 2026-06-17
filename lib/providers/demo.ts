import {
  MarketDataProvider,
  demo,
  unavailable,
  Quote,
  Financials,
  NewsItem,
  EarningsDate,
  Technicals,
} from "./types";

// =============================================================================
// Demo adapter. Returns clearly-fake numbers tagged source: "demo" so the UI
// shows a DEMO badge. Values are now derived from a stable hash of the SYMBOL,
// so different tickers get different (but deterministic) demo data — that lets
// scoring, holdings and rankings show real differentiation before a key is set.
// It can never be mistaken for live data because of the "demo" tag.
// =============================================================================

const NAME = "demo";

function seed(sym: string): number {
  let h = 0;
  for (let i = 0; i < sym.length; i++) h = (h * 31 + sym.charCodeAt(i)) >>> 0;
  return h || 1;
}
// deterministic pseudo-random in [0,1) from a seed and an index
function rnd(h: number, i: number): number {
  const x = Math.sin(h * 9301 + i * 49297) * 233280;
  return x - Math.floor(x);
}

export const demoProvider: MarketDataProvider = {
  name: NAME,

  async getQuote(symbol) {
    const h = seed(symbol);
    const price = 20 + rnd(h, 1) * 480;
    const changePct = (rnd(h, 2) - 0.45) * 7;
    const high = price * (1.1 + rnd(h, 3) * 0.6);
    const low = price * (0.5 + rnd(h, 4) * 0.3);
    const q: Quote = {
      symbol,
      name: `${symbol} (demo)`,
      price: +price.toFixed(2),
      change: +((price * changePct) / 100).toFixed(2),
      changePct: +changePct.toFixed(2),
      marketCap: Math.round(price * (5e7 + rnd(h, 5) * 2e9)),
      volume: Math.round(1e6 + rnd(h, 6) * 4e7),
      week52High: +high.toFixed(2),
      week52Low: +low.toFixed(2),
      currency: "USD",
    };
    return demo(NAME, q);
  },

  async getFinancials(symbol) {
    const h = seed(symbol);
    const g = (rnd(h, 7) - 0.2) * 0.5; // annual growth ~ -10%..+40%
    const baseRev = 500 + rnd(h, 8) * 5000;
    const baseMargin = (rnd(h, 9) - 0.2) * 40; // -8%..+32%
    const fcfPositive = rnd(h, 10) > 0.3;
    const quarters = Array.from({ length: 8 }).map((_, i) => {
      const grow = Math.pow(1 + g / 4, i);
      const revenue = baseRev * grow;
      const opMargin = baseMargin + i * 0.3;
      const netIncome = (revenue * opMargin) / 100;
      return {
        period: `Q${(i % 4) + 1}`,
        revenue: +revenue.toFixed(0),
        netIncome: +netIncome.toFixed(0),
        eps: +((netIncome / (50 + rnd(h, 11) * 500)) ).toFixed(2),
        grossMarginPct: +(45 + rnd(h, 12) * 30).toFixed(1),
        operatingMarginPct: +opMargin.toFixed(1),
        freeCashFlow: +((fcfPositive ? 1 : -1) * revenue * (0.05 + rnd(h, 13) * 0.1)).toFixed(0),
      };
    });
    return demo(NAME, { symbol, quarters });
  },

  async getNews(symbol) {
    const items: NewsItem[] = [
      {
        title: `Demo headline about ${symbol}`,
        url: "#",
        source: "demo",
        publishedAt: new Date().toISOString(),
        summary: "Placeholder text. This is not real news.",
      },
    ];
    return demo(NAME, items);
  },

  async getEarningsDate(symbol) {
    const h = seed(symbol);
    const d = new Date();
    d.setDate(d.getDate() + Math.round(2 + rnd(h, 14) * 58)); // 2..60 days out
    return demo(NAME, { symbol, next: d.toISOString().slice(0, 10) } as EarningsDate);
  },

  async getTechnicals(symbol) {
    const h = seed(symbol);
    const price = 20 + rnd(h, 1) * 480; // same formula as quote
    const t: Technicals = {
      symbol,
      sma50: +(price * (0.9 + rnd(h, 15) * 0.2)).toFixed(2),
      sma200: +(price * (0.8 + rnd(h, 16) * 0.3)).toFixed(2),
      rsi14: +(30 + rnd(h, 17) * 45).toFixed(0),
      sma50Series: [],
      sma200Series: [],
    };
    return demo(NAME, t);
  },

  async getCompanyProfile(symbol) {
    return unavailable(NAME, "Company profile requires a live FMP key.");
  },

  async getAnalystData(symbol) {
    return unavailable(NAME, "Analyst data requires a live FMP key.");
  },

  async getInsiderTrades(symbol) {
    return unavailable(NAME, "Insider trades require a live FMP key.");
  },

  async getDcf(symbol) {
    return unavailable(NAME, "DCF valuation requires a live FMP key.");
  },

  async getPriceHistory(symbol) {
    const h = seed(symbol);
    const end = 20 + rnd(h, 1) * 480; // matches demo quote price
    // Build ~180 daily points walking backward with deterministic noise.
    const points = [];
    let price = end;
    for (let i = 0; i < 180; i++) {
      const d = new Date(2026, 0, 1);
      d.setDate(d.getDate() - i);
      points.push({ date: d.toISOString().slice(0, 10), close: +price.toFixed(2) });
      // step backward: gentle drift + noise
      const drift = (rnd(h, 100 + i) - 0.48) * (end * 0.02);
      price = Math.max(1, price - drift);
    }
    points.reverse();
    return demo(NAME, { symbol, points });
  },
};
