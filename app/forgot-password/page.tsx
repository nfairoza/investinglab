import { forgotPassword } from "../login/actions";
import { AuthShell } from "@/components/auth-shell";
import { AuthSubmit } from "@/components/auth-submit";

export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage({
  searchParams,
}: { searchParams: { error?: string; message?: string } }) {
  return (
    <AuthShell>
      <h1>Reset password</h1>
      <p className="mt-1 text-sm text-ink-dim">We&apos;ll email you a secure reset link.</p>

      {searchParams?.message && <p className="auth-ok">{searchParams.message}</p>}
      {searchParams?.error && <p className="auth-err">{searchParams.error}</p>}

      <form action={forgotPassword} className="auth-form">
        <label>Email<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></label>
        <AuthSubmit pendingText="Sending…">Send reset link</AuthSubmit>
      </form>

      <p className="auth-foot"><a href="/login">Back to sign in</a></p>
    </AuthShell>
  );
}
