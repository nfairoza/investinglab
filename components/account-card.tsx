"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Shield, Trash2, Check, KeyRound, Pencil, X, Mail, Phone, Globe, CalendarDays } from "lucide-react";
import { changePassword } from "@/app/login/actions";

interface Me {
  authenticated?: boolean;
  isAdmin?: boolean;
  email?: string | null;
  createdAt?: string | null;
  provider?: string;
  avatarUrl?: string | null;
  fullName?: string | null;
  phone?: string | null;
}
interface Profile { displayName: string; phone: string; baseCurrency: string; beginnerMode: boolean; }

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  return r.json();
}

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "INR", "JPY"];

export function AccountCard() {
  const { data: me } = useSWR<Me>("/api/me", fetchJson, { revalidateOnFocus: false });
  const { data: profile, mutate: mutateProfile } = useSWR<Profile>("/api/profile-prefs", fetchJson, { revalidateOnFocus: false });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Profile>({ displayName: "", phone: "", baseCurrency: "USD", beginnerMode: true });
  const [saved, setSaved] = useState(false);
  const [savingBusy, setSavingBusy] = useState(false);

  // Social accounts (Google) own name/email/avatar via the provider.
  const isSocial = me?.provider && me.provider !== "email";

  // Resolved display values: profile pref → provider metadata → fallback.
  const resolvedName = profile?.displayName || me?.fullName || "";
  const resolvedPhone = profile?.phone || me?.phone || "";

  // Seed the edit form from the resolved values whenever they load.
  useEffect(() => {
    if (profile) {
      setForm({
        displayName: profile.displayName || me?.fullName || "",
        phone: profile.phone || me?.phone || "",
        baseCurrency: profile.baseCurrency || "USD",
        beginnerMode: profile.beginnerMode ?? true,
      });
    }
  }, [profile, me]);

  async function saveProfile() {
    setSavingBusy(true); setSaved(false);
    await fetch("/api/profile-prefs", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    await mutateProfile();
    setSavingBusy(false); setSaved(true); setEditing(false);
    setTimeout(() => setSaved(false), 2500);
  }

  // Change password — email accounts only. Standard flow: open the form, enter
  // current + new + confirm, validate, submit.
  const [pwOpen, setPwOpen] = useState(false);
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwBusy, setPwBusy] = useState(false);
  function resetPwForm() {
    setCurPw(""); setNewPw(""); setConfirmPw(""); setPwMsg(null); setPwOpen(false);
  }
  async function savePassword() {
    setPwMsg(null);
    if (newPw.length < 8) { setPwMsg({ ok: false, text: "New password must be at least 8 characters." }); return; }
    if (newPw !== confirmPw) { setPwMsg({ ok: false, text: "New passwords don't match." }); return; }
    setPwBusy(true);
    try {
      const res = await changePassword(curPw, newPw);
      setPwMsg({ ok: res.ok, text: res.message });
      if (res.ok) { setCurPw(""); setNewPw(""); setConfirmPw(""); setTimeout(() => setPwOpen(false), 1200); }
    } finally { setPwBusy(false); }
  }

  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function deleteAccount() {
    setDeleting(true); setErr(null);
    try {
      const r = await fetch("/api/account/delete", { method: "POST" });
      if (!r.ok) { const j = await r.json().catch(() => ({})); setErr((j as any).message ?? "Could not delete account."); return; }
      window.location.href = "/login";
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Request failed");
    } finally { setDeleting(false); }
  }

  // Fall back to the email's local part (e.g. "noorkhan") rather than a generic
  // "Your account" when no display name is set yet.
  const emailLocal = me?.email ? me.email.split("@")[0] : "";
  const displayName = resolvedName || emailLocal || "Your account";
  const initial = (resolvedName || me?.email || "?").trim().charAt(0).toUpperCase();
  const memberSince = me?.createdAt ? new Date(me.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "—";

  return (
    <div className="space-y-5">
      {/* ── Identity header card ── */}
      <div className="overflow-hidden rounded-2xl glass">
        <div className="h-16" style={{ background: "var(--brand-gradient)" }} />
        <div className="px-6 pb-6">
          {/* Avatar overlaps the gradient; name/email sit below it (never straddling). */}
          <div className="-mt-10 flex items-start justify-between gap-3">
            {me?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={me.avatarUrl} alt="" className="h-20 w-20 rounded-full border-4 object-cover" style={{ borderColor: "var(--surface-solid)" }} />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 text-2xl font-bold text-white" style={{ background: "var(--nav-active)", borderColor: "var(--surface-solid)" }}>
                {initial}
              </div>
            )}
            {!editing && !isSocial && (
              <button onClick={() => setEditing(true)}
                className="mt-12 inline-flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-1.5 text-sm text-ink-dim transition-colors hover:bg-surface hover:text-ink">
                <Pencil size={14} /> Edit
              </button>
            )}
          </div>
          <div className="mt-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-ink">{displayName}</h2>
              {me?.isAdmin && (
                <span className="inline-flex items-center gap-1 rounded-full border border-brand-500/50 bg-brand-500/10 px-2 py-0.5 text-[11px] font-medium text-brand-300">
                  <Shield size={11} /> Admin
                </span>
              )}
            </div>
            <div className="text-sm text-ink-dim">{me?.email}</div>
          </div>

          {/* ── Info grid (read-only view) ── */}
          {!editing && (
            <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              <InfoRow icon={Mail} label="Email" value={me?.email ?? "—"} />
              <InfoRow icon={Phone} label="Phone" value={resolvedPhone || "Not set"} />
              <InfoRow icon={Globe} label="Base currency" value={form.baseCurrency} />
              <InfoRow icon={CalendarDays} label="Member since" value={memberSince} />
            </div>
          )}

          {/* ── Edit form (email accounts) ── */}
          {editing && (
            <div className="mt-6 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Full name">
                  <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="Your name" className={inputCls} />
                </Field>
                <Field label="Phone (optional)">
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 …" inputMode="tel" className={inputCls} />
                </Field>
                <Field label="Base currency">
                  <select value={form.baseCurrency} onChange={(e) => setForm({ ...form, baseCurrency: e.target.value })} className={inputCls} style={{ background: "var(--surface-solid)", color: "var(--text)" }}>
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <label className="flex items-center gap-2 self-end pb-2.5 text-sm text-ink-dim">
                  <input type="checkbox" checked={form.beginnerMode} onChange={(e) => setForm({ ...form, beginnerMode: e.target.checked })} className="accent-brand-500" />
                  Explain like I&apos;m new
                </label>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={saveProfile} disabled={savingBusy} className="btn-gold rounded-lg px-4 py-2 text-sm disabled:opacity-50">
                  {savingBusy ? "Saving…" : "Save changes"}
                </button>
                <button onClick={() => setEditing(false)} className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-2 text-sm text-ink-dim hover:bg-surface hover:text-ink">
                  <X size={14} /> Cancel
                </button>
              </div>
            </div>
          )}

          {saved && (
            <div className="mt-3 flex items-center gap-1 text-xs text-emerald-400"><Check size={13} /> Profile saved</div>
          )}

          {isSocial && !editing && (
            <p className="mt-5 text-[11px] text-ink-faint">
              Your name and photo come from your {me?.provider === "google" ? "Google" : me?.provider} account. Manage them there.
              You can still set your base currency below.
            </p>
          )}

          {/* Social users still get base-currency control without full edit mode */}
          {isSocial && (
            <div className="mt-4 flex items-center gap-3">
              <span className="text-xs text-ink-faint">Base currency</span>
              <select
                value={form.baseCurrency}
                onChange={async (e) => { const v = e.target.value; setForm((f) => ({ ...f, baseCurrency: v })); await fetch("/api/profile-prefs", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, baseCurrency: v }) }); mutateProfile(); }}
                className="rounded-md border border-hairline px-3 py-1.5 text-sm text-ink focus:outline-none"
                style={{ background: "var(--surface-solid)", color: "var(--text)" }}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ── Security (email accounts) — standard change-password flow ── */}
      {me?.provider === "email" && (
        <div className="rounded-2xl glass p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-ink">Password</div>
              <p className="text-[11px] text-ink-faint">Change the password you use to sign in.</p>
            </div>
            {!pwOpen && (
              <button onClick={() => { setPwMsg(null); setPwOpen(true); }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-1.5 text-sm text-ink-dim hover:bg-surface hover:text-ink">
                <KeyRound size={14} /> Change password
              </button>
            )}
          </div>

          {pwOpen && (
            <div className="mt-4 space-y-3">
              <label className="block text-xs text-ink-faint">Current password
                <input type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} autoComplete="current-password" className={pwInput} />
              </label>
              <label className="block text-xs text-ink-faint">New password
                <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" className={pwInput} />
              </label>
              <label className="block text-xs text-ink-faint">Confirm new password
                <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password" className={pwInput} />
              </label>
              <p className="text-[11px] text-ink-faint">At least 8 characters, and different from your current password.</p>
              {pwMsg && <p className={`text-xs ${pwMsg.ok ? "text-emerald-400" : "text-rose-400"}`}>{pwMsg.text}</p>}
              <div className="flex items-center gap-2">
                <button onClick={savePassword} disabled={pwBusy || !curPw || !newPw || !confirmPw}
                  className="btn-gold rounded-lg px-4 py-2 text-sm disabled:opacity-50">
                  {pwBusy ? "Updating…" : "Update password"}
                </button>
                <button onClick={resetPwForm} className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-2 text-sm text-ink-dim hover:bg-surface hover:text-ink">
                  <X size={14} /> Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sign out lives in the account menu (top-right) — not duplicated here. */}

      {/* ── Danger zone ── */}
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/[0.04] p-6">
        <div className="text-sm font-semibold text-rose-300">Danger zone</div>
        <p className="mt-1 text-[11px] text-ink-faint">
          Deleting your account permanently removes your holdings, watchlist, alerts, cash, and broker
          connections. This cannot be undone.
        </p>
        <div className="mt-4">
          {!confirming ? (
            <button onClick={() => setConfirming(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/50 px-3 py-1.5 text-sm text-rose-400 hover:bg-rose-500/10">
              <Trash2 size={14} /> Delete account
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/5 px-3 py-2">
              <span className="text-xs text-rose-300">Permanently delete your account and all data?</span>
              <button onClick={deleteAccount} disabled={deleting} className="rounded bg-rose-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-rose-500 disabled:opacity-50">
                {deleting ? "Deleting…" : "Yes, delete everything"}
              </button>
              <button onClick={() => setConfirming(false)} className="text-xs text-ink-faint hover:text-ink">Cancel</button>
            </div>
          )}
        </div>
        {err && <p className="mt-2 text-[11px] text-rose-400">{err}</p>}
      </div>
    </div>
  );
}

const pwInput = "mt-1 w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none";

const inputCls = "mt-1 w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs text-ink-faint">{label}{children}</label>;
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface">
        <Icon size={15} className="text-ink-faint" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</div>
        <div className="truncate text-sm font-medium text-ink">{value}</div>
      </div>
    </div>
  );
}
