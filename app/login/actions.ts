"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export async function emailLogin(formData: FormData) {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  });
  if (error) redirect("/login?error=" + encodeURIComponent(error.message));
  revalidatePath("/", "layout");
  redirect("/");
}

export async function emailSignup(formData: FormData) {
  const supabase = createClient();
  const origin = headers().get("origin");
  const fullName = ((formData.get("fullName") as string) ?? "").trim();
  const phone = ((formData.get("phone") as string) ?? "").trim();
  if (!fullName) redirect("/signup?error=" + encodeURIComponent("Please enter your name."));
  const { error } = await supabase.auth.signUp({
    email: formData.get("email") as string,
    password: formData.get("password") as string,
    // Store name + optional phone in user metadata so the profile is prefilled —
    // mirrors what we already get automatically from social (Google) sign-ups.
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      data: { full_name: fullName, ...(phone ? { phone } : {}) },
    },
  });
  if (error) redirect("/signup?error=" + encodeURIComponent(error.message));
  redirect("/login?message=" + encodeURIComponent("Check your email to confirm your account."));
}

export async function oauthLogin(provider: "google") {
  const supabase = createClient();
  const origin = headers().get("origin");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${origin}/auth/callback` },
  });
  if (error) redirect("/login?error=" + encodeURIComponent(error.message));
  if (data.url) redirect(data.url);
}

export async function forgotPassword(formData: FormData) {
  const supabase = createClient();
  const origin = headers().get("origin");
  const { error } = await supabase.auth.resetPasswordForEmail(
    formData.get("email") as string,
    { redirectTo: `${origin}/auth/callback?next=/reset-password` },
  );
  if (error) redirect("/forgot-password?error=" + encodeURIComponent(error.message));
  redirect("/forgot-password?message=" + encodeURIComponent("Check your email for a reset link."));
}

export async function updatePassword(formData: FormData) {
  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password: formData.get("password") as string });
  if (error) redirect("/reset-password?error=" + encodeURIComponent(error.message));
  redirect("/login?message=" + encodeURIComponent("Password updated — please sign in."));
}

// Change password from within the app (Profile → Password). Standard flow:
// verify the CURRENT password first (Supabase updateUser can't), then set the new
// one. Returns a result object so the Profile card can show inline feedback.
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: boolean; message: string }> {
  if (!currentPassword) return { ok: false, message: "Enter your current password." };
  if (!newPassword || newPassword.length < 8) return { ok: false, message: "New password must be at least 8 characters." };
  if (newPassword === currentPassword) return { ok: false, message: "New password must be different from the current one." };

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, message: "Not signed in." };

  // Verify the current password by attempting a sign-in with it.
  const { error: verifyErr } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (verifyErr) return { ok: false, message: "Current password is incorrect." };

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "Password updated successfully." };
}
