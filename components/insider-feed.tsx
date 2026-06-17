"use client";

import useSWR from "swr";
import { DataBadge, DataTimestamp } from "./data-state";
import type { DataResult, InsiderTrade } from "@/lib/providers/types";

async function get(url: string): Promise<DataResult<InsiderTrade[]>> {
  const r = await fetch(url);
  return (await r.json()) as DataResult<InsiderTrade[]>;
}

const TYPE_STYLE: Record<string, string> = {
  "P-Purchase": "border-emerald-500/40 text-emerald-300",
  "S-Sale": "border-rose-500/40 text-rose-300",
};

// Plain-English meaning for each SEC Form-4 transaction code (shown on hover).
const CODE_HELP: Record<string, string> = {
  P: "Open-market purchase — the insider bought shares with their own money. Often the most meaningful signal.",
  S: "Open-market sale — the insider sold shares. Insiders sell for many reasons (taxes, diversification), so it's a weaker signal than buying.",
  A: "Grant or award — shares given to the insider as compensation, not bought on the market.",
  D: "Sale to the issuer — shares sold back to the company.",
  F: "Shares withheld to pay taxes on a vesting grant (not a market sale).",
  M: "Option/derivative exercise converted into shares.",
  G: "Gift of shares (e.g. to family or charity) — no money changed hands.",
  C: "Conversion of a derivative security into shares.",
  X: "Exercise of in-the-money options.",
  J: "Other acquisition or disposition (see the filing for details).",
};

function codeOf(t: string): string {
  return (t || "").trim().charAt(0).toUpperCase();
}

function typeLabel(t: string): string {
  const c = codeOf(t);
  if (c === "P") return "Bought";
  if (c === "S") return "Sold";
  if (c === "A") return "Award";
  if (c === "G") return "Gift";
  if (c === "F") return "Tax-withheld";
  if (c === "M" || c === "X" || c === "C") return "Exercise";
  // Fall back to the human part after the dash, if present.
  const dash = t.indexOf("-");
  return dash >= 0 ? t.slice(dash + 1) : t || "—";
}

function typeStyle(t: string): string {
  return TYPE_STYLE[t] ?? "border-slate-600 text-slate-400";
}

function helpFor(t: string): string {
  return CODE_HELP[codeOf(t)] ?? "See the linked SEC filing for the full transaction details.";
}

// Summarize recent insider activity into a HOLD/confidence-style verdict, based
// purely on the mix of open-market BUYS vs SELLS in the last ~90 days. This is a
// transparent rule, not an AI call: buying is treated as the stronger signal.
function insiderSentiment(trades: InsiderTrade[]) {
  const cutoff = Date.now() - 90 * 86_400_000;
  const recent = trades.filter((t) => {
    const d = new Date(t.date).getTime();
    return !Number.isNaN(d) && d >= cutoff;
  });
  const buys = recent.filter((t) => codeOf(t.transactionType) === "P");
  const sells = recent.filter((t) => codeOf(t.transactionType) === "S");
  const buyVal = buys.reduce((s, t) => s + (t.securitiesTransacted ?? 0) * (t.price ?? 0), 0);
  const sellVal = sells.reduce((s, t) => s + (t.securitiesTransacted ?? 0) * (t.price ?? 0), 0);

  let verdict: "Bullish" | "Bearish" | "Neutral" | "No signal" = "No signal";
  let cls = "text-slate-300 border-slate-600 bg-slate-700/30";
  let confidence = 0;
  let note = "No open-market insider buys or sells in the last 90 days (grants and tax withholdings ignored).";

  if (buys.length || sells.length) {
    const total = buyVal + sellVal || buys.length + sells.length;
    const buyShare = (buyVal || buys.length) / total;
    if (buys.length && buyShare >= 0.6) {
      verdict = "Bullish";
      cls = "text-emerald-200 border-emerald-500/50 bg-emerald-500/10";
      confidence = Math.round(50 + buyShare * 45);
      note = `${buys.length} open-market buy${buys.length !== 1 ? "s" : ""} vs ${sells.length} sell${sells.length !== 1 ? "s" : ""} in 90 days — insiders are net buyers (the stronger signal).`;
    } else if (sells.length && buyShare <= 0.4) {
      verdict = "Bearish";
      cls = "text-rose-200 border-rose-500/50 bg-rose-500/10";
      confidence = Math.round(45 + (1 - buyShare) * 40);
      note = `${sells.length} sell${sells.length !== 1 ? "s" : ""} vs ${buys.length} buy${buys.length !== 1 ? "s" : ""} in 90 days — but insiders sell for many reasons, so weigh this lightly.`;
    } else {
      verdict = "Neutral";
      cls = "text-slate-200 border-slate-500 bg-slate-700/30";
      confidence = 40;
      note = `Mixed insider activity (${buys.length} buy / ${sells.length} sell) in 90 days — no clear lean.`;
    }
  }
  return { verdict, cls, confidence, note, buys: buys.length, sells: sells.length };
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return d;
  return t.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function InsiderFeed({ symbol }: { symbol: string }) {
  const { data, isLoading } = useSWR<DataResult<InsiderTrade[]>>(
    `/api/insider?symbol=${symbol}`,
    get,
    { keepPreviousData: true },
  );

  const trades = data?.data ?? [];
  const sentiment = trades.length ? insiderSentiment(trades) : null;

  return (
    <div className="card-hover rounded-xl glass p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-100">{symbol} — Insider transactions</h2>
        {data && <DataBadge source={data.source} />}
      </div>
      <p className="mt-0.5 text-xs text-slate-500">
        Corporate officers and directors buying or selling their own company&apos;s stock. Insiders sell for many reasons; buying is often more meaningful.
      </p>

      {/* Insider-sentiment verdict (HOLD/confidence-style summary, on top) */}
      {sentiment && (
        <div className={`mt-3 rounded-lg border p-3 ${sentiment.cls}`}>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-lg font-bold">{sentiment.verdict}</span>
            {sentiment.confidence > 0 && (
              <span className="text-xs opacity-90">Signal strength: <span className="font-semibold">{sentiment.confidence}%</span></span>
            )}
            <span className="ml-auto text-[11px] opacity-80">last 90 days · {sentiment.buys} buy / {sentiment.sells} sell</span>
          </div>
          <p className="mt-1 text-xs opacity-90">{sentiment.note}</p>
        </div>
      )}

      {isLoading && <div className="mt-4 h-20 animate-pulse rounded bg-slate-800" />}

      {!isLoading && !data?.data && (
        <p className="mt-3 text-sm text-slate-500">{data?.note ?? "Insider data unavailable."}</p>
      )}

      {trades.length > 0 && (
        <div className="mt-4 max-h-[28rem] overflow-auto rounded-lg border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-black/40 backdrop-blur text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Insider</th>
                <th className="px-3 py-2" title="What the insider did. Hover a tag for what each code means.">Action</th>
                <th className="px-3 py-2">Shares</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2" title="Date the insider actually traded">Traded</th>
                <th className="px-3 py-2" title="Date it was reported to the SEC (Form 4 filing)">Reported</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {trades.slice(0, 60).map((t, i) => (
                <tr key={i} className="hover:bg-slate-800/30">
                  <td className="px-3 py-2 text-slate-200">{t.reportingName}</td>
                  <td className="px-3 py-2">
                    <span
                      title={helpFor(t.transactionType)}
                      className={`cursor-help rounded-md border px-2 py-0.5 text-xs ${typeStyle(t.transactionType)}`}
                    >
                      {typeLabel(t.transactionType)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-300">
                    {t.securitiesTransacted != null ? t.securitiesTransacted.toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-300">
                    {t.price != null ? `$${t.price.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-400" title="Transaction date">{fmtDate(t.date)}</td>
                  <td className="px-3 py-2 text-slate-500" title="SEC filing date">{fmtDate(t.filingDate)}</td>
                  <td className="px-3 py-2">
                    {t.secLink && (
                      <a href={t.secLink} target="_blank" rel="noreferrer" className="text-xs text-brand-400 underline">
                        SEC
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {trades.length === 0 && !isLoading && data?.data && (
        <p className="mt-3 text-sm text-slate-500">No recent insider transactions found.</p>
      )}

      {data && <div className="mt-2"><DataTimestamp asOf={data.asOf} /></div>}
    </div>
  );
}
