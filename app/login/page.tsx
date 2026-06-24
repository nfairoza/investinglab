import { emailLogin, oauthLogin } from "./actions";
import { AuthShell, GoogleIcon } from "@/components/auth-shell";
import { AuthSubmit, OAuthSubmit } from "@/components/auth-submit";
import { InstallButton } from "@/components/install-button";

export const metadata = { title: "Sign in" };

export default function LoginPage({
  searchParams,
}: { searchParams: { error?: string; message?: string } }) {
  return (
    <AuthShell>
      <h1>Welcome back</h1>
      <p className="mt-1 text-sm text-ink-dim">Sign in to your investing workspace.</p>

      {searchParams?.message && <p className="auth-ok">{searchParams.message}</p>}
      {searchParams?.error && <p className="auth-err">{searchParams.error}</p>}

      <form action={emailLogin} className="auth-form">
        <label>Email<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" placeholder="••••••••" required /></label>
        <AuthSubmit pendingText="Signing in…">Sign in</AuthSubmit>
      </form>
      <a href="/forgot-password" className="auth-link">Forgot password?</a>

      <div className="auth-divider"><span>or</span></div>

      <form action={oauthLogin.bind(null, "google")}>
        <OAuthSubmit pendingText="Redirecting…"><GoogleIcon /> Continue with Google</OAuthSubmit>
      </form>

      <p className="auth-foot">New here? <a href="/signup">Create an account</a></p>

      <div className="mt-4 flex justify-center">
        <InstallButton />
      </div>
    </AuthShell>
  );
}
