import {
  LayoutDashboard, Wallet, Eye, NotebookPen, Search, Grid3x3, Trophy,
  Stethoscope, TrendingUp, Landmark, Receipt, PieChart, Sparkles, Bell,
  Plug, Coins, HeartPulse, ShieldAlert, AlertTriangle, Filter, Scale, HelpCircle, Lightbulb, type LucideIcon,
} from "lucide-react";

// =============================================================================
// Single source of truth for rukMoney's information architecture (IA).
// FIVE primary sections with progressive disclosure via sub-tabs:
//   Home · Portfolio · Research · Power Trades · Money
// The desktop sidebar, mobile bottom bar, section sub-nav, and ⌘K palette all
// derive from THIS file, so they can never drift. Account/Settings/Profile/Help/
// Admin live in the top-right account menu.
//
// IA rule: this is a navigation change, not a route rename. Every page keeps its
// own URL; a section's `items` are its existing sibling routes rendered as tabs,
// so deep links stay valid and sub-tab state IS the URL.
// =============================================================================

export interface NavItem { href: string; label: string; icon: LucideIcon }
export interface NavSection { key: string; label: string; href: string; icon: LucideIcon; items: NavItem[] }

export const OVERVIEW: NavItem = { href: "/", label: "Home", icon: LayoutDashboard };

export const SECTIONS: NavSection[] = [
  {
    key: "portfolio",
    label: "Portfolio",
    href: "/holdings",
    icon: Wallet,
    // Holdings (default) · Watching · Doctor · Journal
    items: [
      { href: "/holdings", label: "Holdings", icon: Wallet },
      { href: "/watchlist", label: "Watching", icon: Eye },
      { href: "/portfolio-doctor", label: "Doctor", icon: Stethoscope },
      { href: "/journal", label: "Journal", icon: NotebookPen },
    ],
  },
  {
    key: "research",
    label: "Research",
    href: "/research",
    icon: Search,
    // Research workspace (default) · Screeners · Rankings · Map · Predictions
    items: [
      { href: "/research", label: "Research", icon: Search },
      { href: "/screeners", label: "Screeners", icon: Filter },
      { href: "/rankings", label: "Rankings", icon: Trophy },
      { href: "/map", label: "Stock Map", icon: Grid3x3 },
      { href: "/predictions", label: "Predictions", icon: TrendingUp },
    ],
  },
  {
    key: "power-trades",
    label: "Power Trades",
    href: "/power-trades",
    icon: Landmark,
    // Flagship differentiator — keeps its top-level slot. Single destination.
    items: [
      { href: "/power-trades", label: "Power Trades", icon: Landmark },
    ],
  },
  {
    key: "money",
    label: "Money",
    href: "/money",
    icon: Coins,
    // Money dashboard (default) · Accounts · Transactions · Spending · Insights · Net worth · Doctor
    items: [
      { href: "/money", label: "Dashboard", icon: Coins },
      { href: "/accounts", label: "Accounts", icon: Landmark },
      { href: "/transactions", label: "Transactions", icon: Receipt },
      { href: "/spending", label: "Spending", icon: PieChart },
      { href: "/insights", label: "Insights", icon: Lightbulb },
      { href: "/networth", label: "Net worth", icon: Scale },
      { href: "/accounts-doctor", label: "Accounts Doctor", icon: HeartPulse },
    ],
  },
];

// Admin-only section (hidden from regular users via /api/me isAdmin). Advisor +
// Alerts also live here as full-page fallbacks — their primary homes are the Home
// insight card (Advisor) and the top-bar bell panel (Alerts), but the routes stay
// reachable and indexed.
export const ADMIN_SECTION: NavSection = {
  key: "admin", label: "Admin", href: "/admin", icon: ShieldAlert,
  items: [
    { href: "/admin", label: "Admin Portal", icon: ShieldAlert },
    { href: "/admin/errors", label: "Error log", icon: AlertTriangle },
    { href: "/connectors", label: "Connectors & Keys", icon: Plug },
  ],
};

// Surfaces that no longer have a primary nav slot but must stay reachable + ⌘K-
// indexed (their homes are cards/panels). Kept here so the palette lists them and
// nothing 404s from muscle memory.
export const SECONDARY_PAGES: NavItem[] = [
  { href: "/advisor", label: "AI Advisor", icon: Sparkles },
  { href: "/alerts", label: "Alerts", icon: Bell },
];

// Mobile bottom bar: exactly the 5 primary destinations. `match` lists the routes
// that should light each tab (a section owns all its sub-tab routes).
export interface MobileTab { href: string; label: string; icon: LucideIcon; match: string[]; exact?: boolean }
export const MOBILE_TABS: MobileTab[] = [
  { href: "/", label: "Home", icon: LayoutDashboard, exact: true, match: ["/"] },
  { href: "/holdings", label: "Portfolio", icon: Wallet, match: ["/holdings", "/watchlist", "/portfolio-doctor", "/journal"] },
  { href: "/research", label: "Research", icon: Search, match: ["/research", "/screeners", "/rankings", "/map", "/predictions"] },
  { href: "/power-trades", label: "Power", icon: Landmark, match: ["/power-trades"] },
  { href: "/money", label: "Money", icon: Coins, match: ["/money", "/accounts", "/transactions", "/spending", "/insights", "/networth", "/accounts-doctor"] },
];

// Flat list of every user-facing page (primary sections + secondary + setup),
// for the ⌘K palette / top search. Admin appended by the caller when isAdmin.
export const SETUP_PAGES: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Plug },
  { href: "/profile", label: "Profile", icon: LayoutDashboard },
  { href: "/reports", label: "Reports", icon: Receipt },
  { href: "/help", label: "Help", icon: HelpCircle },
  { href: "/glossary", label: "Glossary", icon: NotebookPen },
];

// True when `path` is `href` or a sub-route of it, matching on SEGMENT
// boundaries so "/accounts-doctor" does NOT match "/accounts". Root "/" only
// matches itself.
export function isPathActive(path: string, href: string): boolean {
  if (href === "/") return path === "/";
  return path === href || path.startsWith(href + "/");
}

// Which section a pathname belongs to (for active highlighting + the sub-nav).
export function sectionForPath(path: string): NavSection | null {
  for (const s of SECTIONS) {
    if (s.items.some((it) => isPathActive(path, it.href))) return s;
  }
  return null;
}
