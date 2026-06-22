import { Blossom } from "./ui/primitives";

// Branded wrapper for all auth screens — full-screen, the app wordmark on top,
// then the page's form. Server component (no client state needed).
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="flex h-9 w-9 items-center justify-center rounded-md border" style={{ borderColor: "var(--hairline-gold)", background: "var(--accent-soft)" }}>
            <Blossom className="h-5 w-5" />
          </span>
          <span className="leading-tight">
            <span className="block font-display text-[17px] font-semibold tracking-tight" style={{ color: "var(--accent)" }}>Noor Investing</span>
            <span className="block text-[9px] font-medium uppercase tracking-[0.3em] text-ink-faint">Lab</span>
          </span>
        </div>
        {children}
        <p className="auth-fineprint">
          Your data is private to your account. Research and educational analysis, not financial advice.
        </p>
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

export function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path fill="#1877F2" d="M24 12c0-6.6-5.4-12-12-12S0 5.4 0 12c0 6 4.4 11 10.1 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.6 4.5-4.6 1.3 0 2.7.2 2.7.2v2.9h-1.5c-1.5 0-1.9.9-1.9 1.8V12h3.3l-.5 3.5h-2.8v8.4C19.6 23 24 18 24 12z" />
    </svg>
  );
}
