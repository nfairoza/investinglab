"use client";

interface PriceZoneBarProps {
  currentPrice: number | null;
  entryZone: string;
  stopLoss: string;
  addBelow?: string | null;
  trimAbove?: string | null;
  sellInvalidation?: string | null;
}

export function PriceZoneBar({
  currentPrice,
  entryZone,
  stopLoss,
  addBelow,
  trimAbove,
  sellInvalidation,
}: PriceZoneBarProps) {
  return (
    <div className="rounded-xl glass p-4">
      <div className="text-sm font-semibold text-ink">Price zones</div>
      <div className="text-xs text-ink-faint mt-0.5">
        Where does today's price sit relative to key levels?
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <ZoneRow label="Current price" value={currentPrice != null ? `$${currentPrice.toFixed(2)}` : "—"} color="text-ink" dot="bg-white" />
        <ZoneRow label="Entry / buy zone" value={entryZone} color="text-emerald-300" dot="bg-emerald-400" />
        {addBelow && <ZoneRow label="Add below" value={addBelow} color="text-emerald-400" dot="bg-emerald-500" />}
        {trimAbove && <ZoneRow label="Trim above" value={trimAbove} color="text-amber-300" dot="bg-amber-400" />}
        {sellInvalidation && <ZoneRow label="Sell / invalidation" value={sellInvalidation} color="text-rose-300" dot="bg-rose-400" />}
        <ZoneRow label="Stop-loss guide" value={stopLoss} color="text-rose-400" dot="bg-rose-500" />
      </div>

      <p className="mt-3 text-[11px] text-ink-faint">
        Entry and stop-loss are heuristic guides from the scoring engine — not precise signals.
        Research and educational analysis, not financial advice.
      </p>
    </div>
  );
}

function ZoneRow({ label, value, color, dot }: { label: string; value: string; color: string; dot: string }) {
  return (
    <div className="flex items-center gap-2 py-1 border-b border-white/5">
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <span className="shrink-0 text-xs text-ink-faint w-32">{label}</span>
      <span className={`text-sm font-medium ${color}`}>{value}</span>
    </div>
  );
}
