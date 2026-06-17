import { ResearchWorkspace } from "@/components/research-workspace";

export default function Page({ searchParams }: { searchParams: { symbol?: string } }) {
  const initial = (searchParams?.symbol ?? "AMD").toUpperCase();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-semibold text-[#ece9e0]">Research</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Enter any ticker for a transparent rules-based score (price trend, growth, valuation,
          margins, cash flow, earnings risk) plus a skeptical AI memo. Read the score and its
          biggest risk before anything else.
        </p>
      </div>
      <ResearchWorkspace initial={initial} />
    </div>
  );
}
