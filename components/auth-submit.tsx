"use client";

import { useFormStatus } from "react-dom";

// Submit button with a built-in pending state, so server-action forms give
// visible feedback ("Signing in…") instead of feeling like nothing happened.
export function AuthSubmit({ children, pendingText }: { children: React.ReactNode; pendingText: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? pendingText : children}
    </button>
  );
}

// Same, for the OAuth provider buttons (keeps the .btn-oauth styling + icon).
export function OAuthSubmit({ children, pendingText }: { children: React.ReactNode; pendingText: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-oauth" disabled={pending}>
      {pending ? pendingText : children}
    </button>
  );
}
