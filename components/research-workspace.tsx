"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { useSearchParams } from "next/navigation";
import { ScoreCard } from "./score-card";
import { ResearchPanel } from "./research-panel";
import { PriceHistoryChart } from "./charts/PriceHistoryChart";
import { PriceChart } from "./charts/PriceChart";
import { CompanyProfileCard } from "./company-profile-card";
import { AnalystPanel } from "./analyst-panel";
import { DcfCard } from "./dcf-card";
import { InsiderFeed } from "./insider-feed";
import { TickerInput } from "./ticker-input";
import { MiniPrediction } from "./mini-prediction";
import { EtfLayout } from "./etf/etf-layout";
import { fetchJson } from "@/lib/fetch-json";
import type { DataResult, CompanyProfile } from "@/lib/providers/types";

export function ResearchWorkspace({ initial = "AMD" }: { initial?: string }) {
  const [draft, setDraft] = useState(initial);
  const [symbol, setSymbol] = useState(initial);

  // Keep the active symbol in sync with the URL's ?symbol= param. Client-side
  // navigations (e.g. clicking a ticker elsewhere) change the URL without
  // remounting this component, so without this every child would keep showing
  // the previously-researched ticker. We never show another ticker's data for
  // the requested symbol.
  const params = useSearchParams();
  const urlSymbol = (params.get("symbol") ?? "").toUpperCase();
  useEffect(() => {
    if (urlSymbol && urlSymbol !== symbol) { setDraft(urlSymbol); setSymbol(urlSymbol); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSymbol]);

  function go(s?: string) {
    const t = (s ?? draft).trim().toUpperCase();
    if (t) { setDraft(t); setSymbol(t); }
  }

  // E1 — branch on isEtf. The profile is fetched here (same key CompanyProfileCard
  // uses, so it's a cache hit) purely to decide the layout; company pages are
  // unchanged when isEtf is false.
  const { data: profile } = useSWR<DataResult<CompanyProfile>>(`/api/profile?symbol=${symbol}`, fetchJson, { revalidateOnFocus: false, keepPreviousData: true });
  const isEtf = Boolean(profile?.data?.isEtf || profile?.data?.isFund);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <TickerInput
          value={draft}
          onChange={setDraft}
          onSelect={(s) => go(s)}
          placeholder="Search ticker or company (e.g. AMD, Apple)…"
        />
        <button onClick={() => go()} className="btn-gold rounded-md px-4 py-2 text-sm">
          Research
        </button>
      </div>
      {/* AI prediction up top, auto-runs for the searched ticker. */}
      <MiniPrediction symbol={symbol} autoRun />
      <CompanyProfileCard symbol={symbol} />
      {isEtf ? (
        // ETF layout replaces the company-financials sections — no empty
        // income-statement / DCF / analyst cards for a fund.
        <EtfLayout symbol={symbol} name={profile?.data?.name ?? null} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <AnalystPanel symbol={symbol} />
            <DcfCard symbol={symbol} />
          </div>
          <ScoreCard symbol={symbol} />
          <PriceChart symbol={symbol} />
          <PriceHistoryChart symbol={symbol} />
          <InsiderFeed symbol={symbol} />
          <ResearchPanel symbol={symbol} />
        </>
      )}
    </div>
  );
}
