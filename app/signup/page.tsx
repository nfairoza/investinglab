import { emailSignup, oauthLogin } from "../login/actions";
import { AuthShell, GoogleIcon, FacebookIcon } from "@/components/auth-shell";
import { AuthSubmit, OAuthSubmit } from "@/components/auth-submit";

export const metadata = { title: "Create account" };

export default function SignupPage({
  searchParams,
}: { searchParams: { error?: string } }) {
  return (
    <AuthShell>
      <h1>Create your account</h1>
      <p className="mt-1 text-sm text-ink-dim">Your holdings, watchlist & research — private to you.</p>

      {searchParams?.error && <p className="auth-err">{searchParams.error}</p>}

      <form action={emailSignup} className="auth-form">
        <label>Email<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></label>
        <label>Password<input name="password" type="password" autoComplete="new-password" placeholder="At least 6 characters" minLength={6} required /></label>
        <AuthSubmit pendingText="Creating account…">Sign up</AuthSubmit>
      </form>

      <div className="auth-divider"><span>or</span></div>

      <form action={oauthLogin.bind(null, "google")}>
        <OAuthSubmit pendingText="Redirecting…"><GoogleIcon /> Continue with Google</OAuthSubmit>
      </form>
      <form action={oauthLogin.bind(null, "facebook")}>
        <OAuthSubmit pendingText="Redirecting…"><FacebookIcon /> Continue with Facebook</OAuthSubmit>
      </form>

      <p className="auth-foot">Already have an account? <a href="/login">Sign in</a></p>
    </AuthShell>
  );
}
