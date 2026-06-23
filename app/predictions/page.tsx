import { PredictionsTabs } from "@/components/predictions-tabs";

export const metadata = { title: "Predictions" };

export default function Page({ searchParams }: { searchParams: { symbol?: string } }) {
  const hasSymbol = Boolean(searchParams?.symbol);
  const initial = (searchParams?.symbol ?? "AMD").toUpperCase();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">AI Predictions</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-dim">
          Two views: a <span className="text-ink">market &amp; portfolio</span> outlook — what to buy,
          add, trim, or sell with your available cash — and a <span className="text-ink">single-ticker</span>{" "}
          deep prediction across 1 week, 1 month, and 1 year. AI opinions using live data + web search, not guarantees.
        </p>
      </div>
      <PredictionsTabs initial={initial} startOnTicker={hasSymbol} />
    </div>
  );
}
