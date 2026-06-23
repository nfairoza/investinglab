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

// Change password from within the app (Settings → Account). Returns a result
// object instead of redirecting, so the Account card can show inline feedback.
export async function changePassword(newPassword: string): Promise<{ ok: boolean; message: string }> {
  if (!newPassword || newPassword.length < 6) return { ok: false, message: "Password must be at least 6 characters." };
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "Password updated." };
}
