"use client";

import { useState } from "react";
import { CongressAlphaFeed } from "./congress-alpha-feed";
import { CongressFeed } from "./congress-feed";

// Two views over the same STOCK Act data: the scored Alpha Feed (default) and
// the raw chronological disclosures (nothing lost from the old tab).
export function CongressTabs() {
  const [tab, setTab] = useState<"alpha" | "raw">("alpha");
  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        <button onClick={() => setTab("alpha")}
          className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === "alpha" ? "tab-active" : "border-hairline text-ink-dim hover:bg-surface"
          }`}>
          Alpha Feed (scored)
        </button>
        <button onClick={() => setTab("raw")}
          className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === "raw" ? "tab-active" : "border-hairline text-ink-dim hover:bg-surface"
          }`}>
          Raw disclosures
        </button>
      </div>
      <p className="text-[11px] text-ink-faint">
        {tab === "alpha"
          ? "Alpha Feed = a SCORED, filtered subset: each trade ranked by conviction (capital size, committee overlap, clustering), plus the most-watched members pulled in. Small routine trades are hidden unless they cluster."
          : "Raw disclosures = EVERY filing in plain chronological order, unscored and unfiltered — so it won't match the Alpha Feed's list, which is deliberately curated."}
      </p>
      {tab === "alpha" ? <CongressAlphaFeed /> : <CongressFeed />}
    </div>
  );
}
