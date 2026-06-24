"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { CongressAlphaFeed } from "./congress-alpha-feed";
import { CongressFeed } from "./congress-feed";

// Two views over the same STOCK Act data: the scored Alpha Feed (default) and
// the raw chronological disclosures (nothing lost from the old tab).
export function CongressTabs() {
  const [tab, setTab] = useState<"alpha" | "raw">("alpha");
  // The explainer panel is dismissable; the choice persists across visits.
  const [showHelp, setShowHelp] = useState(true);
  useEffect(() => {
    try { setShowHelp(localStorage.getItem("congress-help-dismissed") !== "1"); } catch { /* ignore */ }
  }, []);
  function dismissHelp() {
    setShowHelp(false);
    try { localStorage.setItem("congress-help-dismissed", "1"); } catch { /* ignore */ }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto whitespace-nowrap pb-1 [&>button]:shrink-0">
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
      {showHelp && (
        <div className="relative rounded-lg border border-hairline bg-surface/40 p-3 pr-8 text-[11px] text-ink-faint">
          <button onClick={dismissHelp} aria-label="Dismiss" className="absolute right-2 top-2 text-ink-faint hover:text-ink">
            <X size={14} />
          </button>
          {tab === "alpha"
            ? "Alpha Feed = a SCORED, filtered subset: each trade ranked by conviction (capital size, committee overlap, clustering), plus the most-watched members pulled in. Small routine trades are hidden unless they cluster."
            : "Raw disclosures = EVERY filing in plain chronological order, unscored and unfiltered — so it won't match the Alpha Feed's list, which is deliberately curated."}
        </div>
      )}
      {tab === "alpha" ? <CongressAlphaFeed /> : <CongressFeed />}
    </div>
  );
}
