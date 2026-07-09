"use client";

import useSWR from "swr";
import Link from "next/link";
import { Star, ExternalLink } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";
import { ArtImage } from "../ui/art-image";
import { FollowButton } from "./follow-button";

interface Follow { person_id: string; person_name: string; kind: string }
interface Filing { id: string; person_name: string; ticker: string | null; transaction_type: string | null; amount_label: string | null; disclosure_date: string | null }

// F1 "Following" tab: the people this user follows, each with their latest filing
// (from the local normalized power_trade_records). Empty state nudges to the
// directory. Latest filings are fetched per followed person name.
export function FollowingTab() {
  const { data: followData } = useSWR<{ follows: Follow[] }>("/api/follows", fetchJson, { revalidateOnFocus: false });
  const follows = followData?.follows ?? [];
  const names = follows.map((f) => f.person_name);
  // One call for recent filings; we filter client-side per followed person.
  const { data: tradeData } = useSWR<{ rows: Filing[] }>(names.length ? `/api/power-trades/trades?window=1y&limit=500` : null, fetchJson, { revalidateOnFocus: false });
  const rows = tradeData?.rows ?? [];

  const latestByName = new Map<string, Filing>();
  for (const r of rows) {
    if (!latestByName.has(r.person_name)) latestByName.set(r.person_name, r); // rows are date-desc
  }

  if (follows.length === 0) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl glass p-8 text-center">
        <ArtImage name="empty-follows" alt="" className="mx-auto mb-3 h-32 w-auto opacity-95" sizes="480px" />
        <h2 className="text-lg font-semibold text-ink">You&apos;re not following anyone yet</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-ink-dim">
          Follow people in the <span className="text-brand-300">People Directory</span> and we&apos;ll
          notify you when they file a new trade.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {follows.map((f) => {
        const latest = latestByName.get(f.person_name);
        return (
          <div key={f.person_id} className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-surface p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Star size={13} className="shrink-0 fill-amber-400 text-amber-400" />
                <Link href={`/power-trades?person=${encodeURIComponent(f.person_name)}`} className="truncate font-medium text-brand-300 hover:underline">{f.person_name}</Link>
              </div>
              <div className="mt-0.5 text-xs text-ink-faint">
                {latest
                  ? <>Latest: {latest.transaction_type ?? "trade"}{latest.ticker ? ` ${latest.ticker}` : ""}{latest.amount_label ? ` · ${latest.amount_label}` : ""} · {latest.disclosure_date}</>
                  : "No recent filings in the last year."}
              </div>
            </div>
            <FollowButton personId={f.person_id} personName={f.person_name} kind={f.kind === "insider" ? "insider" : "congress"} />
          </div>
        );
      })}
    </div>
  );
}
