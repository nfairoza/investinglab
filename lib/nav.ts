import {
  LayoutDashboard, Wallet, Eye, NotebookPen, Search, Grid3x3, Trophy,
  Stethoscope, TrendingUp, Landmark, Scale, Receipt, PieChart, Sparkles, Bell,
  Plug, Gauge, Coins, type LucideIcon,
} from "lucide-react";

// =============================================================================
// Single source of truth for rukMoney's four-section information architecture.
// Used by the desktop sidebar, the mobile bottom bar, and the Invest sub-nav.
//   Overview · Invest (flagship) · Money · Insights
// Account/Settings/Profile/Help/Admin live in the top-right account menu.
// =============================================================================

export interface NavItem { href: string; label: string; icon: LucideIcon }
export interface NavSection { key: string; label: string; href: string; icon: LucideIcon; items: NavItem[] }

export const OVERVIEW: NavItem = { href: "/", label: "Overview", icon: LayoutDashboard };

export const SECTIONS: NavSection[] = [
  {
    key: "invest",
    label: "Invest",
    href: "/dashboard",
    icon: TrendingUp,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: Gauge },
      { href: "/holdings", label: "Holdings", icon: Wallet },
      { href: "/research", label: "Research", icon: Search },
      { href: "/rankings", label: "Rankings", icon: Trophy },
      { href: "/map", label: "Stock Map", icon: Grid3x3 },
      { href: "/predictions", label: "Predictions", icon: TrendingUp },
      { href: "/portfolio-doctor", label: "Portfolio Doctor", icon: Stethoscope },
      { href: "/congress", label: "Congress", icon: Landmark },
      { href: "/watchlist", label: "Watchlist", icon: Eye },
      { href: "/journal", label: "Journal", icon: NotebookPen },
    ],
  },
  {
    key: "money",
    label: "Money",
    href: "/money",
    icon: Coins,
    items: [
      { href: "/money", label: "Overview", icon: Coins },
      { href: "/networth", label: "Net worth", icon: Scale },
      { href: "/accounts", label: "Accounts", icon: Landmark },
      { href: "/transactions", label: "Transactions", icon: Receipt },
      { href: "/spending", label: "Spending", icon: PieChart },
    ],
  },
  {
    key: "insights",
    label: "Insights",
    href: "/advisor",
    icon: Sparkles,
    items: [
      { href: "/advisor", label: "AI Advisor", icon: Sparkles },
      { href: "/alerts", label: "Alerts", icon: Bell },
    ],
  },
];

// Admin-only section (hidden from regular users via /api/me isAdmin).
export const ADMIN_SECTION: NavSection = {
  key: "admin", label: "Admin", href: "/connectors", icon: Plug,
  items: [{ href: "/connectors", label: "Connectors & Keys", icon: Plug }],
};

// Which section a pathname belongs to (for active highlighting + Invest sub-nav).
export function sectionForPath(path: string): NavSection | null {
  for (const s of SECTIONS) {
    if (s.items.some((it) => it.href === "/" ? path === "/" : path.startsWith(it.href))) return s;
  }
  return null;
}
