"use client";

import { useState } from "react";
import { Landmark, Users, FileText, Layers, ShieldCheck, Coins } from "lucide-react";
import { CongressAlphaFeed } from "@/components/congress-alpha-feed";
import { PeopleDirectory } from "./people-directory";
import { RawDisclosures } from "./raw-disclosures";
import { InfluenceContext } from "./influence-context";
import { SourceCoverage } from "./source-coverage";
import { SourceDiagnostics } from "./source-diagnostics";
import { useIsAdmin } from "@/components/use-is-admin";

type Tab = "alpha" | "people" | "raw" | "influence" | "coverage" | "diagnostics";

export function PowerTradesTabs() {
  const isAdmin = useIsAdmin();
  const [tab, setTab] = useState<Tab>("alpha");

  const tabs: { key: Tab; label: string; icon: typeof Landmark; adminOnly?: boolean }[] = [
    { key: "alpha", label: "Alpha Feed", icon: Landmark },
    { key: "people", label: "People Directory", icon: Users },
    { key: "raw", label: "Raw Disclosures", icon: FileText },
    { key: "influence", label: "Influence Context", icon: Coins },
    { key: "coverage", label: "Source Coverage", icon: Layers },
    { key: "diagnostics", label: "Source Diagnostics", icon: ShieldCheck, adminOnly: true },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto whitespace-nowrap pb-1 [&>button]:shrink-0">
        {tabs.filter((t) => !t.adminOnly || isAdmin).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === key ? "tab-active" : "border-hairline text-ink-dim hover:bg-surface"
            }`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === "alpha" && <CongressAlphaFeed />}
      {tab === "people" && <PeopleDirectory />}
      {tab === "raw" && <RawDisclosures />}
      {tab === "influence" && <InfluenceContext />}
      {tab === "coverage" && <SourceCoverage />}
      {tab === "diagnostics" && isAdmin && <SourceDiagnostics />}
    </div>
  );
}
