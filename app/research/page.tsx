import { Suspense } from "react";
import { ResearchWorkspace } from "@/components/research-workspace";

export const metadata = { title: "Research" };

export default function Page({ searchParams }: { searchParams: { symbol?: string } }) {
  const initial = (searchParams?.symbol ?? "AMD").toUpperCase();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">Research</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-dim">
          Enter any ticker for a transparent rules-based score (price trend, growth, valuation,
          margins, cash flow, earnings risk) plus a skeptical AI memo. Read the score and its
          biggest risk before anything else.
        </p>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface-raised" />}>
        <ResearchWorkspace initial={initial} />
      </Suspense>
    </div>
  );
}
