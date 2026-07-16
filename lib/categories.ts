import {
  UtensilsCrossed, ShoppingBag, ShoppingCart, Clapperboard, Car, Plane, Receipt,
  Home, Landmark, HeartPulse, Sparkles, Repeat, GraduationCap, Gift, Briefcase,
  Coins, ArrowLeftRight, Banknote, Wallet, CircleDollarSign, type LucideIcon,
} from "lucide-react";
import type { DisplayCategory } from "@/lib/money/categorize";

// =============================================================================
// Canonical category → { Lucide icon, section-accent color } map. The SINGLE
// source of truth for how a category renders anywhere in the app — transaction
// rows, spending view, recurring list, the Sankey / flow-list rows, insight
// evidence panels, the category detail page. Same icon + same accent for a given
// category everywhere. Lucide only — NO emoji, per the design system.
// =============================================================================

export interface CategoryStyle { icon: LucideIcon; color: string }

// Accent colors are drawn from the app's chart palette (calm, cohesive).
const C = {
  green: "#16D27E", teal: "#11B4AE", cyan: "#0EA6C9", sky: "#60A5FA", ice: "#22D3EE",
  violet: "#A78BFA", amber: "#F59E0B", gold: "#FBBF24", rose: "#FB7185", mint: "#34E0A1",
  slate: "#8892A0",
};

export const CATEGORY_STYLE: Record<DisplayCategory, CategoryStyle> = {
  "Groceries":         { icon: ShoppingCart, color: C.green },
  "Food & Dining":     { icon: UtensilsCrossed, color: C.amber },
  "Shopping":          { icon: ShoppingBag, color: C.violet },
  "Entertainment":     { icon: Clapperboard, color: C.rose },
  "Transportation":    { icon: Car, color: C.cyan },
  "Travel":            { icon: Plane, color: C.sky },
  "Bills & Utilities": { icon: Receipt, color: C.gold },
  "Rent & Mortgage":   { icon: Home, color: C.teal },
  "Loan Payments":     { icon: Landmark, color: C.ice },
  "Health & Medical":  { icon: HeartPulse, color: C.rose },
  "Personal Care":     { icon: Sparkles, color: C.mint },
  "Subscriptions":     { icon: Repeat, color: C.violet },
  "Education":         { icon: GraduationCap, color: C.sky },
  "Gifts & Donations": { icon: Gift, color: C.rose },
  "Business Services": { icon: Briefcase, color: C.slate },
  "Taxes & Fees":      { icon: Coins, color: C.gold },
  "Income":            { icon: Banknote, color: C.green },
  "Transfers":         { icon: ArrowLeftRight, color: C.slate },
  "Cash & ATM":        { icon: Wallet, color: C.teal },
  "Other":             { icon: CircleDollarSign, color: C.slate },
};

const FALLBACK: CategoryStyle = { icon: CircleDollarSign, color: C.slate };

export function categoryStyle(category: string): CategoryStyle {
  return (CATEGORY_STYLE as Record<string, CategoryStyle>)[category] ?? FALLBACK;
}

// URL-safe slug for the category detail route (/money/category/[slug]).
export function categorySlug(category: string): string {
  return category.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Reverse: resolve a slug back to its display category (exact reversible match).
export function categoryFromSlug(slug: string): DisplayCategory | null {
  const found = (Object.keys(CATEGORY_STYLE) as DisplayCategory[]).find((c) => categorySlug(c) === slug);
  return found ?? null;
}
