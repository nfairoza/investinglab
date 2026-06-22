import { updatePassword } from "../login/actions";
import { AuthShell } from "@/components/auth-shell";

export const metadata = { title: "New password" };

export default function ResetPasswordPage({
  searchParams,
}: { searchParams: { error?: string } }) {
  return (
    <AuthShell>
      <h1>Choose a new password</h1>
      <p className="mt-1 text-sm text-ink-dim">Enter a new password for your account.</p>

      {searchParams?.error && <p className="auth-err">{searchParams.error}</p>}

      <form action={updatePassword} className="auth-form">
        <label>New password<input name="password" type="password" autoComplete="new-password" minLength={6} placeholder="At least 6 characters" required /></label>
        <button type="submit">Update password</button>
      </form>
    </AuthShell>
  );
}
