import { StockMap } from "@/components/stock-map";

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-semibold text-[#ece9e0]">Stock Map</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          A live market heatmap (finviz-style) — large caps grouped by sector, colored by
          today&apos;s move, sized by market cap. Filter by sector and refresh for the latest.
        </p>
      </div>
      <StockMap />
    </div>
  );
}
