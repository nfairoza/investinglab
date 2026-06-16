import { PredictionWorkspace } from "@/components/prediction-workspace";

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">AI Predictions</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Ask Claude to research any stock — it pulls live financials and searches the web for
          recent news, then gives a probabilistic prediction across 1 week, 1 month, and 1 year.
          This is an AI opinion, not a guarantee or market-implied odds.
        </p>
      </div>
      <div className="rounded-lg border border-brand-500/20 bg-brand-500/5 p-3 text-sm text-brand-100">
        <span className="font-medium">What should I look at first?</span> Read the confidence % and
        the &quot;biggest risk&quot; before the direction — a confident-sounding call with a huge risk is
        still a coin flip.
      </div>
      <PredictionWorkspace initial="AAPL" />
    </div>
  );
}
