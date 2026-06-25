import { PowerTradesTabs } from "@/components/power-trades/power-trades-tabs";

export const metadata = { title: "Power Trades" };

export default function Page() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">Power Trades</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-dim">
          Public trades and influence records for powerful people — Congress, executive-branch
          officials, corporate insiders (SEC Form 4), and major donors. The{" "}
          <span className="text-brand-300">Alpha Feed</span> scores filings for conviction;{" "}
          <span className="text-brand-300">People Directory</span> lets you look anyone up.
        </p>
      </div>

      <PowerTradesTabs />

      {/* All disclosures combined into one footer block — kept off the top so the
          page doesn't lead with walls of text, but every required legal point is
          preserved here (STOCK Act lag, ranges, family/spouse, no-coverage
          people, OGE executive-branch source, not-advice). */}
      <details className="group mt-2 rounded-lg border border-hairline bg-surface text-[12px]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-ink-dim hover:text-ink">
          <span className="font-medium">Disclosures, data sources &amp; how to read this</span>
          <span className="text-ink-faint transition-transform group-open:rotate-180">⌄</span>
        </summary>
        <div className="space-y-2.5 border-t border-hairline px-3 py-3 leading-relaxed text-ink-dim">
          <p>
            Power Trades combines public disclosures from multiple sources, each enabled
            independently (see Source Coverage). Congressional filings are{" "}
            <span className="font-medium text-amber-300">delayed (up to 45 days under the STOCK Act)</span>,
            often range-based, and not live trading flow. Family/spouse/dependent transactions appear
            only when disclosed by a covered filer. Many lobbyists, donors, advisors, and celebrities
            have no personal trade disclosure at all — for those people, trade data does not exist.
          </p>
          <p>
            <span className="font-medium text-ink">Executive branch:</span> coverage is partial and
            curated from public OGE disclosures (Form 278e / 278-T), released as documents, not a live
            feed. For complete records use the{" "}
            <a href="https://www.oge.gov/" target="_blank" rel="noreferrer" className="text-brand-400 hover:underline">OGE public disclosure search</a>.
            Family-member and address details are intentionally excluded.
          </p>
          <p className="text-ink-faint">
            Public disclosure data is delayed, incomplete, range-based, and may include
            spouse/dependent/trust/managed-account activity. The conviction score is a transparent,
            rules-based signal — not a buy/sell recommendation. This is research and educational
            data, not a recommendation, advice, or accusation.
          </p>
        </div>
      </details>
    </div>
  );
}
