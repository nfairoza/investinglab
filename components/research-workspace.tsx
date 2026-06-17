"use client";

import { useState } from "react";
import { ScoreCard } from "./score-card";
import { ResearchPanel } from "./research-panel";
import { PriceHistoryChart } from "./charts/PriceHistoryChart";
import { PriceChart } from "./charts/PriceChart";
import { CompanyProfileCard } from "./company-profile-card";
import { AnalystPanel } from "./analyst-panel";
import { DcfCard } from "./dcf-card";
import { InsiderFeed } from "./insider-feed";

export function ResearchWorkspace({ initial = "AAPL" }: { initial?: string }) {
  const [draft, setDraft] = useState(initial);
  const [symbol, setSymbol] = useState(initial);

  function go() {
    const s = draft.trim().toUpperCase();
    if (s) setSymbol(s);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
          placeholder="Enter any US ticker (e.g. AMD)"
          className="w-64 rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-brand-500 focus:outline-none"
        />
        <button onClick={go} className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-500">
          Research
        </button>
      </div>
      <CompanyProfileCard symbol={symbol} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AnalystPanel symbol={symbol} />
        <DcfCard symbol={symbol} />
      </div>
      <ScoreCard symbol={symbol} />
      <PriceChart symbol={symbol} />
      <PriceHistoryChart symbol={symbol} />
      <InsiderFeed symbol={symbol} />
      <ResearchPanel symbol={symbol} />
    </div>
  );
}
