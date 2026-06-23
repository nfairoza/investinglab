import { Blossom } from "./ui/primitives";

// Branded wrapper for all auth screens — Robinhood-style split: a branded panel
// on the left (hidden on small screens) and the form card on the right. Full
// screen, no app chrome. Server component.
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-shell">
      {/* Left brand panel — marketing/identity */}
      <aside className="auth-aside">
        <div className="auth-brand">
          <Blossom className="h-11 w-11" />
          <span className="leading-tight">
            <span className="block font-display text-[22px] font-bold tracking-tight">
              <span style={{ color: "var(--text)" }}>ruk</span><span className="text-shimmer">Money</span>
            </span>
            <span className="block text-[10px] font-medium uppercase tracking-[0.32em] text-ink-faint">AI Wealth</span>
          </span>
        </div>
        <h2 className="auth-aside-head">Your banking, spending, and E&#8209;Trade portfolio. Unified and predicted by AI.</h2>
        <div className="auth-trust">
          🔒 Read-Only Bank Integration via Bank-Grade 256-Bit Encryption. Your Capital Stays Yours.
        </div>
        <ul className="auth-aside-list">
          <li>Live holdings, scores & research in one place</li>
          <li>AI finds where to put your cash</li>
          <li>Smart alerts on what actually matters</li>
        </ul>
        <p className="auth-aside-foot">Private to your account · Not financial advice</p>
      </aside>

      {/* Right form card */}
      <div className="auth-card">
        <div className="auth-brand auth-brand-mobile">
          <Blossom className="h-9 w-9" />
          <span className="font-display text-[18px] font-bold tracking-tight">
            <span style={{ color: "var(--text)" }}>ruk</span><span className="text-shimmer">Money</span>
          </span>
        </div>
        {children}
      </div>
    </main>
  );
}

// Inline brand SVGs so OAuth buttons render correct logos with no extra deps.
export function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.5 29.3 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.5 29.3 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 43.5c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 34.5 26.7 35.5 24 35.5c-5.2 0-9.6-3.3-11.2-7.9l-6.5 5C9.6 38.9 16.2 43.5 24 43.5z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.2 5.2c-.4.4 6.6-4.8 6.6-14.7 0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}

