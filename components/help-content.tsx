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

      {/* PT3 — the method behind Power Trades track records + flags. Linked from
          the person Track Record card ("Method"). */}
      <div id="pt-method" className="scroll-mt-20 rounded-xl glass p-5">
        <h2 className="text-lg font-semibold text-ink">Power Trades — how the numbers are computed</h2>
        <div className="mt-3 space-y-3 text-sm text-ink-dim">
          <p>
            <span className="text-ink">Signal decay.</span> Each trade shows its disclosure lag
            (trade date → the up-to-45-day-later filing date) and the price move since both the
            trade date and the disclosure date — the return a follower could actually have captured.
          </p>
          <p>
            <span className="text-ink">Track record.</span> For each person we measure whether their
            <em> disclosed buys</em> (trailing 24 months, options excluded) beat simply buying the
            S&amp;P 500 — the excess return vs SPY at +30/+90/+180 days, measured from the
            <em> disclosure</em> date, equal-weighted. With fewer than 8 realized trades we show
            &ldquo;insufficient history&rdquo; instead of a percentage — small samples are noise.
          </p>
          <p>
            <span className="text-ink">Committee overlap &amp; insider clusters.</span> A congressional
            trade is flagged when the ticker&apos;s sector falls in a committee the member sits on
            (context, not an accusation). An insider &ldquo;cluster&rdquo; is 3+ distinct insiders making
            open-market purchases of the same company within 30 days.
          </p>
          <p className="text-[11px] text-ink-faint">
            Everything is computed by deterministic code from free/public sources (congressional
            PTRs, SEC Form 4, OGE, committee rosters) — no paid data, no AI-invented figures. Bands
            stay bands. Past excess return does not predict future return.
          </p>
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
