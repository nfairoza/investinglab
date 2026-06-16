import { CongressFeed } from "@/components/congress-feed";

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">Congress Tracker</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Stock trades disclosed by U.S. members of Congress under the STOCK Act. Filter by member
          or ticker to see what&apos;s been reported. Following specific members and getting an alert
          when they trade a stock you hold or watch wires up alongside the rest of the alert system.
        </p>
      </div>

      {/* Beginner "what should I look at first?" callout, matching the app pattern. */}
      <div className="rounded-lg border border-brand-500/20 bg-brand-500/5 p-3 text-sm text-brand-200">
        New to this? Each row is one disclosed trade: who traded, whether they bought or sold, the
        ticker, and the dollar range. Read the <span className="font-medium">Disclosed</span> date —
        it can be weeks after the trade actually happened.
      </div>

      <CongressFeed />

      <p className="text-[11px] text-slate-600">
        Research &amp; educational analysis, not financial advice.
      </p>
    </div>
  );
}
