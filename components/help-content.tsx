"use client";

import Link from "next/link";
import { MessageCircle, BookOpen, LinkIcon, Shield, TrendingUp } from "lucide-react";

const FAQ: { q: string; a: string }[] = [
  {
    q: "How do I connect my brokerage?",
    a: "Go to Settings → Connect your brokerage. Link E*TRADE (read-only OAuth) or Robinhood. Your positions then sync into Holdings. Connections are private to your account and read-only — no trades are ever placed.",
  },
  {
    q: "Can other users see my data?",
    a: "No. Holdings, watchlist, journal, alerts, cash, and broker connections are isolated per account by database row-level security. Only general market predictions (single-ticker / mini) are shared and cached to save tokens — those contain no personal data.",
  },
  {
    q: "Are the AI predictions financial advice?",
    a: "No. Everything here is research and education only. Predictions are probabilistic opinions from live data + web search, never guarantees. Always do your own research.",
  },
  {
    q: "Why do predictions sometimes say “cached”?",
    a: "General single-ticker predictions are market-only, so the same result is reused across users for up to 2 hours to save AI tokens. Hit Refresh on the Predictions page to force a fresh run.",
  },
  {
    q: "How do I change my profile or password?",
    a: "Open the account menu (top-right) → Profile. There you can edit your display name, phone, base currency, and password (email accounts).",
  },
];

export function HelpContent() {
  return (
    <div className="space-y-6">
      {/* Ask the AI assistant */}
      <div className="rounded-xl border border-brand-500/20 bg-gradient-to-br from-brand-500/[0.07] to-transparent p-5">
        <div className="flex items-center gap-2 text-ink">
          <MessageCircle size={18} className="text-brand-400" />
          <span className="font-semibold">Ask Rukmani, your AI assistant</span>
        </div>
        <p className="mt-1 text-sm text-ink-dim">
          The fastest way to get help. Rukmani is your financial advisor, investment banker, and
          finance teacher in one — ask anything about your portfolio, a ticker, a finance term, or
          how to use the app. She knows every page.
        </p>
        <button
          onClick={() => window.dispatchEvent(new Event("open-chat"))}
          className="btn-gold mt-3 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm"
        >
          <MessageCircle size={15} /> Chat with Rukmani
        </button>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <HelpLink href="/glossary" icon={BookOpen} title="Glossary" desc="Plain-English finance terms" />
        <HelpLink href="/settings" icon={LinkIcon} title="Connect brokerage" desc="Sync E*TRADE / Robinhood" />
        <HelpLink href="/predictions" icon={TrendingUp} title="AI predictions" desc="How forecasts work" />
      </div>

      {/* FAQ */}
      <div className="rounded-xl glass p-5">
        <h2 className="text-lg font-semibold text-ink">Frequently asked</h2>
        <div className="mt-3 divide-y divide-hairline">
          {FAQ.map((f) => (
            <details key={f.q} className="group py-3">
              <summary className="cursor-pointer list-none text-sm font-medium text-ink marker:content-none">
                <span className="text-brand-400 group-open:hidden">+ </span>
                <span className="hidden text-brand-400 group-open:inline">− </span>
                {f.q}
              </summary>
              <p className="mt-2 pl-4 text-sm text-ink-dim">{f.a}</p>
            </details>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-ink-faint">
        <Shield size={12} /> Research and education only — not financial advice.
      </div>
    </div>
  );
}

function HelpLink({ href, icon: Icon, title, desc }: { href: string; icon: typeof BookOpen; title: string; desc: string }) {
  return (
    <Link href={href} className="card-hover rounded-xl border border-hairline bg-surface p-4 transition-colors hover:border-brand-500/30">
      <Icon size={18} className="text-brand-400" />
      <div className="mt-2 text-sm font-semibold text-ink">{title}</div>
      <div className="text-xs text-ink-faint">{desc}</div>
    </Link>
  );
}
