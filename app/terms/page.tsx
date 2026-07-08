import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Service" };

// DRAFT — plain-English terms for review. Not legal advice; have counsel review
// before relying on it.
const UPDATED = "July 2026";

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <a href="/login" className="text-sm text-ink-faint hover:text-ink-dim">← Back</a>
      <h1 className="mt-4 font-display text-3xl font-semibold text-ink">Terms of Service</h1>
      <p className="mt-1 text-sm text-ink-faint">Last updated: {UPDATED}</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-ink-dim">
        <section>
          <h2 className="text-base font-semibold text-ink">Acceptance</h2>
          <p>
            By using rukMoney you agree to these terms. If you don&apos;t agree, don&apos;t
            use the service.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">What rukMoney is</h2>
          <p>
            rukMoney is a personal research and money-tracking tool. It aggregates
            data from institutions you connect, computes views of your finances, and
            offers AI-generated research, predictions, and an assistant.{" "}
            <strong>It is for research and education only — not investment, legal, or
            tax advice.</strong> You are solely responsible for your financial
            decisions.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">No guarantees on data or predictions</h2>
          <p>
            Market data, fundamentals, and filings come from third-party providers
            and may be delayed, incomplete, or wrong. AI predictions and scores are
            probabilistic opinions, not facts, and are frequently wrong. Do not rely
            on any figure or forecast without verifying it yourself.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">Your account</h2>
          <p>
            Keep your credentials secure and don&apos;t share your account. You&apos;re
            responsible for activity under your account. Connected institutions are
            accessed read-only; rukMoney cannot move money or place trades.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">Acceptable use</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Don&apos;t abuse, overload, scrape, or reverse-engineer the service.</li>
            <li>Don&apos;t use it for anything unlawful or to infringe others&apos; rights.</li>
            <li>Don&apos;t attempt to access data that isn&apos;t yours.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">Availability</h2>
          <p>
            The service is provided &quot;as is&quot; and may change, break, or be unavailable.
            Features that depend on third parties (Plaid, market data, AI providers)
            can be interrupted or rate-limited outside our control.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">Limitation of liability</h2>
          <p>
            To the maximum extent permitted by law, rukMoney is not liable for any
            losses arising from your use of the service, including investment losses,
            data inaccuracies, or downtime.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">Changes &amp; termination</h2>
          <p>
            We may update these terms; continued use means you accept the changes. You
            can stop using the service and delete your account at any time.
          </p>
        </section>

        <p className="text-xs text-ink-faint">
          This is a working draft pending legal review and does not yet constitute a
          binding agreement.
        </p>
      </div>
    </main>
  );
}
