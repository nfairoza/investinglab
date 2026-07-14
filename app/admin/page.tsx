import Link from "next/link";
import { AlertTriangle, Plug, BellRing } from "lucide-react";
import { AiCostCard } from "@/components/admin/ai-cost-card";
import { NavTimingCard } from "@/components/admin/nav-timing-card";
import { AiHealthBanner } from "@/components/admin/ai-health-banner";

export const metadata = { title: "Admin Portal" };

export default function AdminHome() {
  return (
    <div className="space-y-4">
      {/* AIOPT A6 — provider-health banner (warns when a configured provider fails >1h). */}
      <AiHealthBanner />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Link href="/admin/errors" className="card-hover rounded-2xl glass p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink"><AlertTriangle size={16} className="text-amber-400" /> Error log</div>
        <p className="mt-1 text-sm text-ink-dim">Every user-facing error captured across the app — AI, market data, Plaid, auth — with who hit it, when, where, and why. Filter and triage.</p>
      </Link>
      <Link href="/admin/deliveries" className="card-hover rounded-2xl glass p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink"><BellRing size={16} className="text-brand-400" /> Alert deliveries</div>
        <p className="mt-1 text-sm text-ink-dim">Spot-check how alerts reached a user: push sent, seen, and whether the missed-alert email safety net fired. Filter by user id.</p>
      </Link>
      <Link href="/connectors" className="card-hover rounded-2xl glass p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Plug size={16} className="text-brand-400" /> Connectors &amp; Keys</div>
        <p className="mt-1 text-sm text-ink-dim">Platform API keys: AI providers, brokerage, and finance-data sources.</p>
      </Link>
      <AiCostCard />
      <NavTimingCard />
      </div>
    </div>
  );
}
