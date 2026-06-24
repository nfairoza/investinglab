"use client";

import useSWR from "swr";
import Link from "next/link";
import { DataBadge, DataNote } from "./data-state";
import type { DataResult, CompanyProfile } from "@/lib/providers/types";

async function get(url: string): Promise<DataResult<CompanyProfile>> {
  const r = await fetch(url);
  return (await r.json()) as DataResult<CompanyProfile>;
}

function fmtM(n: number | null) {
  if (n == null) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

export function CompanyProfileCard({ symbol }: { symbol: string }) {
  const { data, isLoading } = useSWR<DataResult<CompanyProfile>>(
    `/api/profile?symbol=${symbol}`,
    get,
    { keepPreviousData: true },
  );

  const p = data?.data;

  return (
    <div className="card-hover rounded-xl glass p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">{symbol} — Company overview</h2>
        {data && <DataBadge source={data.source} />}
      </div>

      {isLoading && <div className="mt-4 h-24 animate-pulse rounded bg-surface-raised" />}

      {!isLoading && !p && (
        <DataNote note={data?.note} fallback="Profile unavailable." className="mt-3 block text-sm text-ink-faint" />
      )}

      {p && (
        <div className="mt-4 space-y-4">
          {/* Key facts grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            <Fact label="Sector" value={p.sector ?? "—"} />
            <Fact label="Industry" value={p.industry ?? "—"} />
            <Fact label="Exchange" value={p.exchange ?? "—"} />
            <Fact label="Market cap" value={fmtM(p.marketCap)} />
            <Fact label="Employees" value={p.employees ? p.employees.toLocaleString() : "—"} />
            <Fact label="Beta" value={p.beta != null ? p.beta.toFixed(2) : "—"} />
            <Fact label="CEO" value={p.ceo ?? "—"} />
            <Fact label="IPO date" value={p.ipoDate ?? "—"} />
            {p.website && (
              <div className="flex justify-between gap-3 border-b border-hairline py-1">
                <span className="text-ink-faint">Website</span>
                <a href={p.website} target="_blank" rel="noreferrer" className="text-right text-brand-400 underline truncate max-w-[160px]">
                  {p.website.replace(/^https?:\/\//, "")}
                </a>
              </div>
            )}
          </div>

          {/* Description */}
          {p.description && (
            <p className="text-sm text-ink-dim leading-relaxed line-clamp-4">{p.description}</p>
          )}

          {/* Peers */}
          {p.peers.length > 0 && (
            <div>
              <div className="text-xs text-ink-faint mb-1">Peers</div>
              <div className="flex flex-wrap gap-2">
                {p.peers.slice(0, 8).map((peer) => (
                  <a key={peer} href={`/research?symbol=${peer}`}
                    className="rounded-md border border-hairline px-2 py-0.5 text-xs text-brand-300 hover:bg-surface-raised">
                    {peer}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-hairline py-1">
      <span className="text-ink-faint shrink-0">{label}</span>
      <span className="text-right text-ink-dim">{value}</span>
    </div>
  );
}
