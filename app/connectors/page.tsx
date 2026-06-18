import { SettingsAI } from "@/components/settings-ai";
import { Connectors, SectionHeading, ConnectorList } from "@/components/connectors";
import { EtradeConnector } from "@/components/etrade-connector";
import { RobinhoodConnector } from "@/components/robinhood-connector";
import { Suspense } from "react";

export default function Page() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold text-[#ece9e0]">Connectors &amp; API keys</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-dim">
          One place for every data source and the AI layer. Add keys as you get them — the app
          switches from demo to live automatically when a key is detected.
        </p>
      </div>

      {/* ── AI providers ── */}
      <section className="space-y-3">
        <SectionHeading title="AI providers" subtitle="Power the research memos, predictions, and the chat widget. Claude is primary; Gemini is the fallback." />
        <SettingsAI />
        <ConnectorList category="ai" />
      </section>

      {/* ── Brokerage / portfolio ── */}
      <section className="space-y-3">
        <SectionHeading title="Brokerage" subtitle="Connect a broker to sync your real positions into Holdings (read-only)." />
        <Suspense>
          <EtradeConnector />
        </Suspense>
        <RobinhoodConnector />
      </section>

      {/* ── Finance data + other (rendered by Connectors) ── */}
      <Connectors />
    </div>
  );
}
