import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy" };

// DRAFT — plain-English privacy policy for review. Not legal advice; have counsel
// review before relying on it. Reflects how the app actually works today:
// per-user Supabase (RLS), Plaid read-only connections, encrypted secrets, and
// AI providers that process prompt context.
const UPDATED = "July 2026";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <a href="/login" className="text-sm text-ink-faint hover:text-ink-dim">← Back</a>
      <h1 className="mt-4 font-display text-3xl font-semibold text-ink">Privacy Policy</h1>
      <p className="mt-1 text-sm text-ink-faint">Last updated: {UPDATED}</p>

      <div className="prose-legal mt-8 space-y-6 text-sm leading-relaxed text-ink-dim">
        <section>
          <h2 className="text-base font-semibold text-ink">The short version</h2>
          <p>
            rukMoney is a personal research and money-tracking tool. Your financial
            data is scoped to your account and used to show you your own picture and
            power the features you invoke. We connect to your banks and brokerages
            <strong> read-only</strong> — we can&apos;t move your money. We don&apos;t sell your
            personal data.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">What we collect</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Account info</strong> — email, name, and optional phone you provide at sign-up (via Supabase Auth or Google sign-in).</li>
            <li><strong>Linked-account data</strong> — balances, holdings, transactions, and liabilities from institutions you connect through Plaid. Connections are read-only.</li>
            <li><strong>Data you enter</strong> — manual assets/liabilities, watchlists, journal notes, preferences.</li>
            <li><strong>Usage + diagnostics</strong> — errors and basic performance metrics so we can keep the app working.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">How your data is used</h2>
          <p>
            To compute your net worth, spending, and portfolio views; to run the
            research, prediction, and assistant features you ask for; and to keep the
            service reliable. Market data (prices, fundamentals, filings) is not
            personal to you.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">Third parties we share with</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Plaid</strong> — to securely connect your financial institutions.</li>
            <li><strong>Supabase</strong> — our database and authentication provider, storing your data with per-user row-level security.</li>
            <li><strong>AI providers (Anthropic, Google)</strong> — when you use an AI feature, the relevant context (e.g. the tickers or figures needed for that request) is sent to generate the response.</li>
            <li><strong>Market-data provider</strong> — for quotes, fundamentals, and filings (not personal to you).</li>
            <li><strong>Hosting (Vercel)</strong> — to run and serve the app.</li>
          </ul>
          <p>We do not sell your personal data or share it for third-party advertising.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">Security</h2>
          <p>
            Connector credentials and access tokens are encrypted at rest. Access to
            your data is scoped to your authenticated account. No system is perfectly
            secure, but we design for least-privilege and read-only access.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">Your choices</h2>
          <p>
            You can disconnect a linked institution at any time in Settings, delete
            individual data you&apos;ve entered, or delete your account (which removes your
            stored data). Contact us to exercise data-access or deletion rights.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">Not financial advice</h2>
          <p>
            rukMoney is for research and education. Nothing here is investment,
            legal, or tax advice.
          </p>
        </section>

        <p className="text-xs text-ink-faint">
          This is a working draft pending legal review and does not yet constitute a
          binding policy.
        </p>
      </div>
    </main>
  );
}
