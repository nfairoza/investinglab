"use client";

import { useState } from "react";
import { Globe, Target } from "lucide-react";
import { MarketOutlook } from "./market-outlook";
import { PredictionWorkspace } from "./prediction-workspace";

// Two views: a whole-market + portfolio outlook (buy/sell plan as a table), and
// the single-ticker deep prediction. Defaults to the ticker view when arrived
// via ?symbol= (e.g. clicking a ticker), else the market overview.
export function PredictionsTabs({ initial }: { initial: string }) {
  const [tab, setTab] = useState<"market" | "ticker">(initial && initial !== "AMD" ? "ticker" : "market");

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        <button onClick={() => setTab("market")}
          className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === "market" ? "tab-active" : "border-hairline text-ink-dim hover:bg-surface"
          }`}>
          <Globe size={14} /> Market &amp; portfolio
        </button>
        <button onClick={() => setTab("ticker")}
          className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === "ticker" ? "tab-active" : "border-hairline text-ink-dim hover:bg-surface"
          }`}>
          <Target size={14} /> Single ticker
        </button>
      </div>

      {tab === "market" ? <MarketOutlook /> : <PredictionWorkspace initial={initial} />}
    </div>
  );
}
