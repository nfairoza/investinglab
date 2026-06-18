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
            tab === "alpha" ? "border-brand-500/60 bg-brand-500/15 text-brand-200" : "border-white/10 text-slate-400 hover:bg-white/5"
          }`}>
          Alpha Feed (scored)
        </button>
        <button onClick={() => setTab("raw")}
          className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === "raw" ? "border-brand-500/60 bg-brand-500/15 text-brand-200" : "border-white/10 text-slate-400 hover:bg-white/5"
          }`}>
          Raw disclosures
        </button>
      </div>
      {tab === "alpha" ? <CongressAlphaFeed /> : <CongressFeed />}
    </div>
  );
}
