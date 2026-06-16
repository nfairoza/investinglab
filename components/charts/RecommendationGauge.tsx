"use client";

import type { Rating } from "@/lib/research/types";

const RATING_STYLE: Record<Rating, { bg: string; border: string; text: string }> = {
  Buy: { bg: "bg-emerald-500/20", border: "border-emerald-500/60", text: "text-emerald-200" },
  "Buy gradually": { bg: "bg-emerald-500/10", border: "border-emerald-500/40", text: "text-emerald-300" },
  Hold: { bg: "bg-brand-500/10", border: "border-brand-500/40", text: "text-brand-300" },
  Wait: { bg: "bg-amber-500/10", border: "border-amber-500/40", text: "text-amber-300" },
  Avoid: { bg: "bg-rose-500/10", border: "border-rose-500/40", text: "text-rose-300" },
  Sell: { bg: "bg-rose-500/20", border: "border-rose-500/60", text: "text-rose-200" },
};

export function RecommendationGauge({
  rating,
  confidence,
  biggestRisk,
  oneLineThesis,
}: {
  rating: Rating;
  confidence: number;
  biggestRisk: string;
  oneLineThesis?: string;
}) {
  const style = RATING_STYLE[rating] ?? RATING_STYLE["Hold"];

  return (
    <div className={`rounded-xl border p-4 ${style.bg} ${style.border}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`text-2xl font-bold ${style.text}`}>{rating}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-slate-400">Confidence:</span>
          <span className={`text-sm font-semibold ${style.text}`}>{confidence}%</span>
        </div>
      </div>

      {oneLineThesis && (
        <p className="mt-2 text-sm text-slate-300">{oneLineThesis}</p>
      )}

      <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
        <span className="font-medium text-amber-200">Biggest risk: </span>
        <span className="text-amber-100">{biggestRisk}</span>
      </div>

      <p className="mt-2 text-[11px] text-slate-600">
        Always state what would change this recommendation. Research and educational analysis, not financial advice.
      </p>
    </div>
  );
}
