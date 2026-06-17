import { SettingsAI } from "@/components/settings-ai";
import { Connectors } from "@/components/connectors";
import { EtradeConnector } from "@/components/etrade-connector";
import { Suspense } from "react";

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-semibold text-[#ece9e0]">Connectors &amp; API keys</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          One place for every data source and the AI layer. Add keys as you get them — the app
          switches from demo to live automatically when a key is detected.
        </p>
      </div>
      <SettingsAI />
      {/* E*TRADE uses Suspense because EtradeConnector reads searchParams via useSearchParams */}
      <Suspense>
        <EtradeConnector />
      </Suspense>
      <Connectors />
    </div>
  );
}
