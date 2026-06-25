"use client";

import { useState } from "react";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";

// Categorized, Robinhood-style filter panel for the screener. Uses ONLY the
// fields FMP's company-screener actually supports (see docs/SCREENER_FILTERS.md)
// — every control here truly filters. Desktop: a left rail. Mobile: a drawer
// (parent decides; this renders the inner content + Apply/Reset).

export interface ScreenFormFilters {
  marketCapMoreThan: string; marketCapLowerThan: string;
  priceMoreThan: string; priceLowerThan: string;
  volumeMoreThan: string;
  betaMoreThan: string; betaLowerThan: string;
  dividendMoreThan: string;
  sector: string; exchange: string;
  isEtf: string; // "" | "true" | "false"
}

export const EMPTY_FILTERS: ScreenFormFilters = {
  marketCapMoreThan: "", marketCapLowerThan: "", priceMoreThan: "", priceLowerThan: "",
  volumeMoreThan: "", betaMoreThan: "", betaLowerThan: "", dividendMoreThan: "",
  sector: "", exchange: "", isEtf: "",
};

const SECTORS = ["", "Technology", "Healthcare", "Financial Services", "Consumer Cyclical", "Consumer Defensive", "Energy", "Industrials", "Basic Materials", "Communication Services", "Utilities", "Real Estate"];
const EXCHANGES = ["", "NASDAQ", "NYSE", "AMEX"];

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-hairline py-2.5">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        {title}
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="mt-2 space-y-2">{children}</div>}
    </div>
  );
}

// A row of quick-pick chips that set one field to a fixed value.
function Chips({ value, options, onPick }: { value: string; options: { label: string; v: string }[]; onPick: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.label} onClick={() => onPick(value === o.v ? "" : o.v)}
          className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${value === o.v ? "border-brand-500 bg-brand-500/10 text-ink" : "border-hairline text-ink-dim hover:text-ink"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const inputCls = "w-full rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none";

export function ScreenerFiltersPanel({
  value, onChange, onApply, onReset, onClose,
}: {
  value: ScreenFormFilters;
  onChange: (next: ScreenFormFilters) => void;
  onApply: () => void;
  onReset: () => void;
  onClose?: () => void; // present in mobile drawer
}) {
  const set = (k: keyof ScreenFormFilters, v: string) => onChange({ ...value, [k]: v });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink"><SlidersHorizontal size={15} className="text-brand-400" /> Filters</div>
        {onClose && <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-ink-faint hover:text-ink"><X size={16} /></button>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
        <Section title="Market">
          <div className="text-[10px] text-ink-faint">Market cap</div>
          <Chips value={value.marketCapMoreThan} onPick={(v) => set("marketCapMoreThan", v)} options={[
            { label: "Small $300M+", v: "300000000" }, { label: "Mid $2B+", v: "2000000000" },
            { label: "Large $10B+", v: "10000000000" }, { label: "Mega $200B+", v: "200000000000" },
          ]} />
          <div className="grid grid-cols-2 gap-2">
            <input value={value.marketCapMoreThan} onChange={(e) => set("marketCapMoreThan", e.target.value)} inputMode="numeric" placeholder="Min $" className={inputCls} />
            <input value={value.marketCapLowerThan} onChange={(e) => set("marketCapLowerThan", e.target.value)} inputMode="numeric" placeholder="Max $" className={inputCls} />
          </div>
          <div className="pt-1 text-[10px] text-ink-faint">Sector</div>
          <select value={value.sector} onChange={(e) => set("sector", e.target.value)} className={inputCls} style={{ background: "var(--surface-solid)", color: "var(--text)" }}>
            {SECTORS.map((s) => <option key={s} value={s}>{s || "Any sector"}</option>)}
          </select>
          <div className="pt-1 text-[10px] text-ink-faint">Exchange</div>
          <select value={value.exchange} onChange={(e) => set("exchange", e.target.value)} className={inputCls} style={{ background: "var(--surface-solid)", color: "var(--text)" }}>
            {EXCHANGES.map((s) => <option key={s} value={s}>{s || "Any exchange"}</option>)}
          </select>
          <div className="pt-1 text-[10px] text-ink-faint">Type</div>
          <Chips value={value.isEtf} onPick={(v) => set("isEtf", v)} options={[
            { label: "Stocks", v: "false" }, { label: "ETFs", v: "true" },
          ]} />
        </Section>

        <Section title="Price">
          <Chips value={value.priceLowerThan} onPick={(v) => set("priceLowerThan", v)} options={[
            { label: "Under $5", v: "5" }, { label: "Under $20", v: "20" },
            { label: "Under $50", v: "50" }, { label: "Under $100", v: "100" },
          ]} />
          <div className="grid grid-cols-2 gap-2">
            <input value={value.priceMoreThan} onChange={(e) => set("priceMoreThan", e.target.value)} inputMode="decimal" placeholder="Min $" className={inputCls} />
            <input value={value.priceLowerThan} onChange={(e) => set("priceLowerThan", e.target.value)} inputMode="decimal" placeholder="Max $" className={inputCls} />
          </div>
        </Section>

        <Section title="Volume">
          <Chips value={value.volumeMoreThan} onPick={(v) => set("volumeMoreThan", v)} options={[
            { label: "Over 100K", v: "100000" }, { label: "Over 500K", v: "500000" },
            { label: "Over 1M", v: "1000000" }, { label: "Over 5M", v: "5000000" }, { label: "Over 10M", v: "10000000" },
          ]} />
          <input value={value.volumeMoreThan} onChange={(e) => set("volumeMoreThan", e.target.value)} inputMode="numeric" placeholder="Min volume" className={inputCls} />
        </Section>

        <Section title="Dividend" defaultOpen={false}>
          <Chips value={value.dividendMoreThan} onPick={(v) => set("dividendMoreThan", v)} options={[
            { label: "Pays a dividend", v: "0.01" }, { label: "$1+", v: "1" }, { label: "$2+", v: "2" }, { label: "$3+", v: "3" },
          ]} />
          <input value={value.dividendMoreThan} onChange={(e) => set("dividendMoreThan", e.target.value)} inputMode="decimal" placeholder="Min dividend $/yr" className={inputCls} />
        </Section>

        <Section title="Risk (beta)" defaultOpen={false}>
          <Chips value={value.betaLowerThan} onPick={(v) => set("betaLowerThan", v)} options={[
            { label: "Low vol (<0.8)", v: "0.8" }, { label: "Calm (<1)", v: "1" },
          ]} />
          <Chips value={value.betaMoreThan} onPick={(v) => set("betaMoreThan", v)} options={[
            { label: "Higher vol (>1.5)", v: "1.5" }, { label: "Aggressive (>2)", v: "2" },
          ]} />
          <div className="grid grid-cols-2 gap-2">
            <input value={value.betaMoreThan} onChange={(e) => set("betaMoreThan", e.target.value)} inputMode="decimal" placeholder="Min beta" className={inputCls} />
            <input value={value.betaLowerThan} onChange={(e) => set("betaLowerThan", e.target.value)} inputMode="decimal" placeholder="Max beta" className={inputCls} />
          </div>
        </Section>
      </div>

      <div className="flex items-center gap-2 border-t border-hairline pt-3">
        <button onClick={() => { onApply(); onClose?.(); }} className="flex-1 rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-500">Run screen</button>
        <button onClick={onReset} className="rounded-md border border-hairline px-3 py-2 text-sm text-ink-dim hover:text-ink">Reset</button>
      </div>
    </div>
  );
}
