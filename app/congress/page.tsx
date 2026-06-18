import { CongressTabs } from "@/components/congress-tabs";

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-semibold text-[#ece9e0]">Congress Tracker</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          STOCK Act disclosures, scored for conviction. The <span className="text-brand-300">Alpha Feed</span> filters
          out routine retail-size trades and surfaces high-conviction ones using capital scale, the member&apos;s
          committee jurisdiction over the stock&apos;s sector, cross-party clustering, and an AI-estimated options read.
        </p>
      </div>

      {/* Beginner "what should I look at first?" callout, matching the app pattern. */}
      <div className="rounded-lg border border-brand-500/20 bg-brand-500/5 p-3 text-sm text-brand-200">
        New here? Start with the <span className="font-medium">Alpha Feed</span> — higher score = stronger structural
        edge (big position + a committee that regulates that sector + others trading it too). Click a row to see the
        score breakdown and the official filing. Switch to <span className="font-medium">Raw disclosures</span> for the
        full chronological list.
      </div>

      <CongressTabs />

      <p className="text-[11px] text-slate-600">
        Research &amp; educational analysis, not financial advice.
      </p>
    </div>
  );
}
