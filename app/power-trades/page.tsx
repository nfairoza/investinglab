import { PowerTradesTabs } from "@/components/power-trades/power-trades-tabs";

export const metadata = { title: "Power Trades" };

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">Power Trades</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-dim">
          Public disclosures of trades and influence records for powerful people — members of
          Congress, executive-branch officials, corporate insiders (SEC Form 4), and major
          donors/lobbyists as influence context. The <span className="text-brand-300">Alpha Feed</span> scores
          filings for conviction; the <span className="text-brand-300">People Directory</span> lets you look up
          anyone and see honestly what coverage exists. Each source is enabled independently — see
          Source Coverage.
        </p>
      </div>

      {/* Honesty banner — required wording. */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-[13px] text-amber-200">
        Power Trades combines public disclosures from multiple sources. Congressional filings are
        delayed (up to 45 days under the STOCK Act), often range-based, and not live trading flow.
        Family/spouse/dependent transactions appear only when disclosed by a covered filer. Many
        lobbyists, donors, advisors, and celebrities have no personal trade disclosure at all — for
        those people, trade data does not exist.
      </div>

      {/* Executive-branch coverage disclosure — required wording. */}
      <div className="rounded-lg border border-hairline bg-surface p-3 text-[13px] text-ink-dim">
        Executive-branch coverage is partial and curated from public OGE disclosures (Form 278e /
        278-T), which are released as documents, not a live feed. For complete records, use the{" "}
        <a href="https://www.oge.gov/" target="_blank" rel="noreferrer" className="text-brand-400 hover:underline">OGE public disclosure search</a>.
        Family-member and address details are intentionally excluded.
      </div>

      <PowerTradesTabs />

      <p className="text-[11px] text-ink-faint">
        Public disclosure data is delayed, incomplete, range-based, and may include
        spouse/dependent/trust/managed-account activity. Research data, not a recommendation or
        accusation.
      </p>
    </div>
  );
}
