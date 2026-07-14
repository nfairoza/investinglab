"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Landmark, Users, FileText, Layers, ShieldCheck, Coins, Star, Boxes, Activity } from "lucide-react";
import { CongressAlphaFeed } from "@/components/congress-alpha-feed";
import { PeopleDirectory } from "./people-directory";
import { FollowingTab } from "./following-tab";
import { RawDisclosures } from "./raw-disclosures";
import { ClustersTab } from "./clusters-tab";
import { FlowTab } from "./flow-tab";
import { OverlapCard } from "./overlap-card";
import { InfluenceContext } from "./influence-context";
import { SourceCoverage } from "./source-coverage";
import { SourceDiagnostics } from "./source-diagnostics";
import { useIsAdmin } from "@/components/use-is-admin";

type Tab = "alpha" | "people" | "following" | "raw" | "clusters" | "flow" | "influence" | "coverage" | "diagnostics";

const TAB_KEYS: Tab[] = ["alpha", "people", "following", "raw", "clusters", "flow", "influence", "coverage", "diagnostics"];

export function PowerTradesTabs() {
  const isAdmin = useIsAdmin();
  const sp = useSearchParams();
  // Honor ?tab= (e.g. the insider-cluster notification deeplinks to ?tab=clusters).
  const initial = sp.get("tab");
  const [tab, setTab] = useState<Tab>(initial && TAB_KEYS.includes(initial as Tab) ? (initial as Tab) : "alpha");

  const tabs: { key: Tab; label: string; icon: typeof Landmark; adminOnly?: boolean }[] = [
    { key: "alpha", label: "Alpha Feed", icon: Landmark },
    { key: "people", label: "People Directory", icon: Users },
    { key: "following", label: "Following", icon: Star },
    { key: "raw", label: "Raw Disclosures", icon: FileText },
    { key: "clusters", label: "Clusters", icon: Boxes },
    { key: "flow", label: "Flow", icon: Activity },
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

      {/* PT6: portfolio overlap — self-hides when there's no follows ∩ holdings ∩
          recent-trades. Always at the top so a match is never buried in a tab. */}
      <OverlapCard />

      {tab === "alpha" && <CongressAlphaFeed />}
      {tab === "people" && <PeopleDirectory />}
      {tab === "following" && <FollowingTab />}
      {tab === "raw" && <RawDisclosures />}
      {tab === "clusters" && <ClustersTab />}
      {tab === "flow" && <FlowTab />}
      {tab === "influence" && <InfluenceContext />}
      {tab === "coverage" && <SourceCoverage />}
      {tab === "diagnostics" && isAdmin && <SourceDiagnostics />}
    </div>
  );
}
