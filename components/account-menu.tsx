"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { User, FileText, Settings as SettingsIcon, HelpCircle, LogOut, Shield, ChevronDown, Plug } from "lucide-react";

interface Me {
  authenticated?: boolean;
  isAdmin?: boolean;
  email?: string | null;
  avatarUrl?: string | null;
  fullName?: string | null;
}

const fetchJson = (u: string) => fetch(u).then((r) => r.json());

// Top-right account menu (Vercel / Robinhood / Google style): avatar button that
// opens a dropdown with the user's identity + quick links + sign out.
export function AccountMenu() {
  const { data: me } = useSWR<Me>("/api/me", fetchJson, { revalidateOnFocus: false });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click + Escape.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, []);

  if (!me?.authenticated) return null;

  const name = me.fullName || me.email?.split("@")[0] || "Account";
  const initial = (me.fullName || me.email || "?").trim().charAt(0).toUpperCase();

  const items = [
    { href: "/profile", label: "Profile", icon: User },
    { href: "/reports", label: "Reports & statements", icon: FileText },
    { href: "/settings", label: "Settings", icon: SettingsIcon },
    { href: "/help", label: "Help", icon: HelpCircle },
  ];
  // Admin-only tools (platform API keys etc.) — never rendered for regular users.
  const adminItems = me.isAdmin
    ? [{ href: "/connectors", label: "Connectors & Keys", icon: Plug }]
    : [];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-hairline bg-surface/60 py-1 pl-1 pr-2.5 transition-colors hover:bg-surface"
        title="Account"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Avatar avatarUrl={me.avatarUrl} initial={initial} />
        <span className="hidden max-w-[120px] truncate text-sm font-medium text-ink sm:inline">{name}</span>
        <ChevronDown size={14} className={`text-ink-faint transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-hairline shadow-xl animate-fade-in"
          style={{ background: "var(--surface-solid)" }}
        >
          {/* Identity header */}
          <div className="flex items-center gap-3 border-b border-hairline px-4 py-3">
            <Avatar avatarUrl={me.avatarUrl} initial={initial} large />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold text-ink">{name}</span>
                {me.isAdmin && <Shield size={12} className="shrink-0 text-brand-400" />}
              </div>
              <div className="truncate text-xs text-ink-dim">{me.email}</div>
            </div>
          </div>

          {/* Links */}
          <div className="py-1.5">
            {items.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                role="menuitem"
                className="flex items-center gap-3 px-4 py-2 text-sm text-ink-dim transition-colors hover:bg-surface hover:text-ink"
              >
                <Icon size={16} className="text-ink-faint" />
                {label}
              </Link>
            ))}
          </div>

          {/* Admin tools — only for administrators */}
          {adminItems.length > 0 && (
            <div className="border-t border-hairline py-1.5">
              <div className="px-4 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">Admin</div>
              {adminItems.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  role="menuitem"
                  className="flex items-center gap-3 px-4 py-2 text-sm text-ink-dim transition-colors hover:bg-surface hover:text-ink"
                >
                  <Icon size={16} className="text-brand-400" />
                  {label}
                </Link>
              ))}
            </div>
          )}

          {/* Sign out */}
          <div className="border-t border-hairline py-1.5">
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                role="menuitem"
                className="flex w-full items-center gap-3 px-4 py-2 text-sm text-ink-dim transition-colors hover:bg-surface hover:text-ink"
              >
                <LogOut size={16} className="text-ink-faint" />
                Log out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Avatar({ avatarUrl, initial, large }: { avatarUrl?: string | null; initial: string; large?: boolean }) {
  const size = large ? "h-10 w-10 text-base" : "h-8 w-8 text-sm";
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt="" className={`${size} shrink-0 rounded-full border border-hairline-strong object-cover`} />;
  }
  return (
    <div className={`${size} flex shrink-0 items-center justify-center rounded-full font-semibold text-white`} style={{ background: "var(--nav-active)" }}>
      {initial}
    </div>
  );
}
