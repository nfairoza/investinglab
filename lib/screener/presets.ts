import type { ScreenerFilters } from "@/lib/providers/types";

// =============================================================================
// Screener preset catalog — the canonical library (in code, not a DB table, so
// adding/editing a preset is a reviewable code change with no migration).
//
// Every preset maps ONLY to verified FMP company-screener params (the fields on
// ScreenerFilters). No invented filters. The AI daily-ranking picks an order
// from THESE keys — it can never invent a preset.
//
// imagePrompt is consumed ONCE by scripts/generate-preset-images.mjs to produce
// public/images/presets/<key>.jpg. The app never calls the image API at runtime.
// =============================================================================

export type PresetCategory =
  | "momentum" | "value" | "dividend" | "growth" | "sector"
  | "size" | "volatility" | "income" | "speculative" | "quality";

export interface ScreenerPreset {
  key: string;
  label: string;
  blurb: string;
  category: PresetCategory;
  filters: ScreenerFilters;
  imagePrompt: string;
}

// Shared art direction so all images feel like ONE cohesive set and read well
// in BOTH light and dark themes. They render as small circular thumbnails, so:
// centered subject, simple flat/soft-3D icon look, transparent-friendly neutral
// mid-tone backdrop (not pure black, not pure white), restrained palette. Small
// size + simple style keeps generation cheap.
const ART = " — small circular app-icon style, single centered subject, simple soft-3D minimal illustration, restrained emerald/teal accent palette on a neutral slate backdrop, even soft lighting, looks good on both light and dark UI, no text, no logos, no numbers, clean, low detail, square.";

const B = 1_000_000_000; // billion
const M = 1_000_000;     // million

export const PRESETS: ScreenerPreset[] = [
  // ── Momentum ──────────────────────────────────────────────────────────────
  { key: "high-momentum", label: "High Momentum", blurb: "High-beta names trading on heavy volume.", category: "momentum",
    filters: { betaMoreThan: 1.5, volumeMoreThan: 2 * M, marketCapMoreThan: 1 * B }, imagePrompt: "An upward surging arrow made of light particles accelerating" + ART },
  { key: "volume-surge", label: "Volume Surge", blurb: "Liquid stocks seeing big trading activity.", category: "momentum",
    filters: { volumeMoreThan: 10 * M, marketCapMoreThan: 1 * B }, imagePrompt: "A rising sound-wave / volume bars glowing with energy" + ART },
  { key: "large-cap-movers", label: "Large-Cap Movers", blurb: "Big, active companies with momentum.", category: "momentum",
    filters: { marketCapMoreThan: 50 * B, volumeMoreThan: 3 * M, betaMoreThan: 1 }, imagePrompt: "Massive glowing spheres in motion leaving light trails" + ART },
  { key: "aggressive-growth", label: "Aggressive Growth", blurb: "High-beta growth with real liquidity.", category: "momentum",
    filters: { betaMoreThan: 1.3, volumeMoreThan: 1 * M, marketCapMoreThan: 2 * B, priceMoreThan: 10 }, imagePrompt: "A steep ascending mountain ridge of light" + ART },

  // ── Value ─────────────────────────────────────────────────────────────────
  { key: "large-cap-value", label: "Large-Cap Value", blurb: "Big, stable companies at modest prices.", category: "value",
    filters: { marketCapMoreThan: 20 * B, priceLowerThan: 100, betaLowerThan: 1.2 }, imagePrompt: "A solid stone pillar with a soft golden gleam, grounded and stable" + ART },
  { key: "blue-chip", label: "Blue Chips", blurb: "Mega-cap, lower-volatility leaders.", category: "value",
    filters: { marketCapMoreThan: 100 * B, betaLowerThan: 1.1 }, imagePrompt: "A polished blue gemstone radiating calm light" + ART },
  { key: "steady-midcaps", label: "Steady Mid-Caps", blurb: "Mid-sized firms, calmer price swings.", category: "value",
    filters: { marketCapMoreThan: 2 * B, marketCapLowerThan: 10 * B, betaLowerThan: 1.1 }, imagePrompt: "Balanced floating stones in gentle equilibrium" + ART },
  { key: "affordable-quality", label: "Affordable Quality", blurb: "Solid companies trading under $50.", category: "value",
    filters: { priceLowerThan: 50, marketCapMoreThan: 5 * B, volumeMoreThan: 500_000 }, imagePrompt: "A small bright coin glowing with disproportionate value" + ART },

  // ── Dividend / Income ───────────────────────────────────────────────────────
  { key: "dividend-payers", label: "Dividend Payers", blurb: "Companies returning cash to holders.", category: "dividend",
    filters: { dividendMoreThan: 1, marketCapMoreThan: 2 * B }, imagePrompt: "A gentle waterfall of golden coins of light" + ART },
  { key: "high-yield", label: "High Yield", blurb: "Larger dividends from established firms.", category: "dividend",
    filters: { dividendMoreThan: 3, marketCapMoreThan: 5 * B }, imagePrompt: "A lush tree heavy with glowing golden fruit" + ART },
  { key: "dividend-blue-chip", label: "Dividend Blue Chips", blurb: "Mega-caps that pay and stay calm.", category: "income",
    filters: { dividendMoreThan: 1, marketCapMoreThan: 50 * B, betaLowerThan: 1.1 }, imagePrompt: "A sturdy oak with golden leaves under steady light" + ART },
  { key: "income-stability", label: "Income & Stability", blurb: "Low-beta payers for steady income.", category: "income",
    filters: { dividendMoreThan: 2, betaLowerThan: 0.9, marketCapMoreThan: 10 * B }, imagePrompt: "A calm still lake reflecting soft golden light" + ART },

  // ── Growth ──────────────────────────────────────────────────────────────────
  { key: "growth-leaders", label: "Growth Leaders", blurb: "Large, liquid growth-oriented names.", category: "growth",
    filters: { marketCapMoreThan: 10 * B, betaMoreThan: 1.1, volumeMoreThan: 2 * M }, imagePrompt: "A sprouting plant of light bursting upward" + ART },
  { key: "emerging-growth", label: "Emerging Growth", blurb: "Mid-caps with momentum and liquidity.", category: "growth",
    filters: { marketCapMoreThan: 2 * B, marketCapLowerThan: 20 * B, betaMoreThan: 1.2, volumeMoreThan: 1 * M }, imagePrompt: "Young saplings of light rising from dark soil" + ART },
  { key: "innovation", label: "Innovation", blurb: "Higher-beta names driving change.", category: "growth",
    filters: { betaMoreThan: 1.4, marketCapMoreThan: 3 * B, priceMoreThan: 15 }, imagePrompt: "An abstract glowing neural / circuit bloom" + ART },

  // ── Sector ──────────────────────────────────────────────────────────────────
  { key: "technology", label: "Technology", blurb: "The tech sector, large and liquid.", category: "sector",
    filters: { sector: "Technology", marketCapMoreThan: 2 * B, volumeMoreThan: 1 * M }, imagePrompt: "Abstract glowing microchip circuitry" + ART },
  { key: "healthcare", label: "Healthcare", blurb: "Health & biotech of meaningful size.", category: "sector",
    filters: { sector: "Healthcare", marketCapMoreThan: 2 * B }, imagePrompt: "An abstract glowing caduceus / DNA helix of light" + ART },
  { key: "financials", label: "Financials", blurb: "Banks, insurers, financial services.", category: "sector",
    filters: { sector: "Financial Services", marketCapMoreThan: 5 * B }, imagePrompt: "Abstract glowing classical columns and arches" + ART },
  { key: "energy", label: "Energy", blurb: "Energy producers and services.", category: "sector",
    filters: { sector: "Energy", marketCapMoreThan: 2 * B }, imagePrompt: "A glowing droplet of energy with radiating light" + ART },
  { key: "consumer-cyclical", label: "Consumer Cyclical", blurb: "Discretionary spending names.", category: "sector",
    filters: { sector: "Consumer Cyclical", marketCapMoreThan: 2 * B }, imagePrompt: "An abstract glowing shopping/retail motif of light" + ART },
  { key: "consumer-defensive", label: "Consumer Staples", blurb: "Defensive everyday-goods firms.", category: "sector",
    filters: { sector: "Consumer Defensive", marketCapMoreThan: 5 * B, betaLowerThan: 1 }, imagePrompt: "A glowing basket of essential goods, calm light" + ART },
  { key: "industrials", label: "Industrials", blurb: "Manufacturing and industrial firms.", category: "sector",
    filters: { sector: "Industrials", marketCapMoreThan: 3 * B }, imagePrompt: "Abstract glowing interlocking gears of light" + ART },
  { key: "utilities", label: "Utilities", blurb: "Low-beta utility companies.", category: "sector",
    filters: { sector: "Utilities", marketCapMoreThan: 3 * B, betaLowerThan: 0.9 }, imagePrompt: "Glowing power lines / grid against calm dark sky" + ART },
  { key: "real-estate", label: "Real Estate", blurb: "REITs and property companies.", category: "sector",
    filters: { sector: "Real Estate", marketCapMoreThan: 2 * B }, imagePrompt: "Abstract glowing skyline of light towers" + ART },
  { key: "communication", label: "Communication", blurb: "Media, telecom, internet services.", category: "sector",
    filters: { sector: "Communication Services", marketCapMoreThan: 5 * B }, imagePrompt: "Abstract glowing signal waves connecting nodes" + ART },
  { key: "basic-materials", label: "Basic Materials", blurb: "Miners, chemicals, materials.", category: "sector",
    filters: { sector: "Basic Materials", marketCapMoreThan: 2 * B }, imagePrompt: "A glowing raw crystal / ore formation" + ART },
  { key: "tech-large", label: "Mega-Cap Tech", blurb: "The biggest, most liquid tech.", category: "sector",
    filters: { sector: "Technology", marketCapMoreThan: 100 * B, volumeMoreThan: 3 * M }, imagePrompt: "Towering luminous circuit monoliths" + ART },

  // ── Size ────────────────────────────────────────────────────────────────────
  { key: "mega-cap", label: "Mega Caps", blurb: "The largest companies on the market.", category: "size",
    filters: { marketCapMoreThan: 200 * B }, imagePrompt: "Giant luminous planets dominating the frame" + ART },
  { key: "large-cap", label: "Large Caps", blurb: "Established large companies.", category: "size",
    filters: { marketCapMoreThan: 10 * B, marketCapLowerThan: 200 * B }, imagePrompt: "Large steady orbs of light" + ART },
  { key: "mid-cap", label: "Mid Caps", blurb: "Mid-sized companies with room to grow.", category: "size",
    filters: { marketCapMoreThan: 2 * B, marketCapLowerThan: 10 * B, volumeMoreThan: 500_000 }, imagePrompt: "Medium glowing spheres rising" + ART },
  { key: "small-cap", label: "Small Caps", blurb: "Smaller companies, higher potential.", category: "size",
    filters: { marketCapMoreThan: 300 * M, marketCapLowerThan: 2 * B, volumeMoreThan: 500_000 }, imagePrompt: "Small bright sparks with big glow" + ART },

  // ── Volatility ──────────────────────────────────────────────────────────────
  { key: "low-volatility", label: "Low Volatility", blurb: "Calmer names that move less.", category: "volatility",
    filters: { betaLowerThan: 0.8, marketCapMoreThan: 5 * B }, imagePrompt: "A perfectly calm flat horizon of soft light" + ART },
  { key: "defensive", label: "Defensive", blurb: "Low-beta, larger, steadier stocks.", category: "volatility",
    filters: { betaLowerThan: 0.9, marketCapMoreThan: 20 * B, dividendMoreThan: 0.5 }, imagePrompt: "A glowing shield of soft light" + ART },
  { key: "high-volatility", label: "High Volatility", blurb: "Big swings for active traders.", category: "volatility",
    filters: { betaMoreThan: 2, marketCapMoreThan: 1 * B, volumeMoreThan: 1 * M }, imagePrompt: "A jagged lightning storm of energy" + ART },

  // ── Quality ─────────────────────────────────────────────────────────────────
  { key: "quality-compounders", label: "Quality Compounders", blurb: "Large, calm, dividend-paying quality.", category: "quality",
    filters: { marketCapMoreThan: 50 * B, betaLowerThan: 1.1, dividendMoreThan: 0.5 }, imagePrompt: "A flawless faceted diamond of light" + ART },
  { key: "stable-giants", label: "Stable Giants", blurb: "Huge, low-beta, established leaders.", category: "quality",
    filters: { marketCapMoreThan: 100 * B, betaLowerThan: 1 }, imagePrompt: "A vast serene mountain glowing softly" + ART },
  { key: "fortress", label: "Fortress Balance", blurb: "Mega-cap defensive dividend names.", category: "quality",
    filters: { marketCapMoreThan: 80 * B, betaLowerThan: 0.95, dividendMoreThan: 1.5 }, imagePrompt: "A luminous fortress wall, solid and calm" + ART },

  // ── Speculative ──────────────────────────────────────────────────────────────
  { key: "high-risk-movers", label: "High-Risk Movers", blurb: "Volatile small caps with volume. Risky.", category: "speculative",
    filters: { betaMoreThan: 2, marketCapMoreThan: 300 * M, marketCapLowerThan: 2 * B, volumeMoreThan: 1 * M }, imagePrompt: "A volatile glowing comet streaking dangerously" + ART },
  { key: "affordable-active", label: "Affordable & Active", blurb: "Low-priced, high-volume names. Risky.", category: "speculative",
    filters: { priceLowerThan: 20, volumeMoreThan: 5 * M, marketCapMoreThan: 300 * M }, imagePrompt: "Many small bright sparks swirling fast" + ART },
  { key: "momentum-smallcap", label: "Small-Cap Momentum", blurb: "Small caps with high beta + volume. Risky.", category: "speculative",
    filters: { marketCapMoreThan: 300 * M, marketCapLowerThan: 2 * B, betaMoreThan: 1.5, volumeMoreThan: 2 * M }, imagePrompt: "A tiny rocket of light blasting upward" + ART },

  // ── Income (extra) ───────────────────────────────────────────────────────────
  { key: "monthly-stability", label: "Steady Earners", blurb: "Low-beta dividend mid/large caps.", category: "income",
    filters: { dividendMoreThan: 1.5, betaLowerThan: 1, marketCapMoreThan: 5 * B }, imagePrompt: "A steady glowing metronome of calm light" + ART },
  { key: "yield-and-size", label: "Big & Generous", blurb: "Large caps with healthy dividends.", category: "income",
    filters: { dividendMoreThan: 2.5, marketCapMoreThan: 20 * B }, imagePrompt: "A grand glowing chalice overflowing with light" + ART },

  // ── Value (extra) ────────────────────────────────────────────────────────────
  { key: "everyday-leaders", label: "Everyday Leaders", blurb: "Large staples + utilities, calm.", category: "value",
    filters: { betaLowerThan: 1, marketCapMoreThan: 20 * B, dividendMoreThan: 1 }, imagePrompt: "A calm lighthouse beam over still water" + ART },
  { key: "broad-market", label: "Broad Market", blurb: "Liquid companies across the market.", category: "value",
    filters: { marketCapMoreThan: 2 * B, volumeMoreThan: 1 * M, isActivelyTrading: true }, imagePrompt: "A wide field of evenly glowing lights" + ART },

  // ── Growth (extra) ───────────────────────────────────────────────────────────
  { key: "midcap-momentum", label: "Mid-Cap Momentum", blurb: "Mid caps with momentum + liquidity.", category: "momentum",
    filters: { marketCapMoreThan: 2 * B, marketCapLowerThan: 10 * B, betaMoreThan: 1.3, volumeMoreThan: 1 * M }, imagePrompt: "A climbing wave of light cresting" + ART },
  { key: "liquid-leaders", label: "Liquid Leaders", blurb: "Very high-volume large caps.", category: "momentum",
    filters: { marketCapMoreThan: 20 * B, volumeMoreThan: 10 * M }, imagePrompt: "Fast-flowing rivers of light converging" + ART },

  // ── Sector (extra) ───────────────────────────────────────────────────────────
  { key: "tech-growth", label: "Tech Growth", blurb: "Higher-beta tech with liquidity.", category: "sector",
    filters: { sector: "Technology", betaMoreThan: 1.3, marketCapMoreThan: 2 * B, volumeMoreThan: 1 * M }, imagePrompt: "Glowing circuit vines growing upward fast" + ART },
  { key: "healthcare-large", label: "Healthcare Giants", blurb: "Large, steadier healthcare names.", category: "sector",
    filters: { sector: "Healthcare", marketCapMoreThan: 30 * B, betaLowerThan: 1.1 }, imagePrompt: "A serene glowing helix tower" + ART },
  { key: "bank-leaders", label: "Banking Leaders", blurb: "Large financial-services firms.", category: "sector",
    filters: { sector: "Financial Services", marketCapMoreThan: 30 * B, dividendMoreThan: 1 }, imagePrompt: "Luminous vault doors and columns" + ART },
  { key: "energy-dividends", label: "Energy Income", blurb: "Energy names that pay dividends.", category: "sector",
    filters: { sector: "Energy", dividendMoreThan: 2, marketCapMoreThan: 5 * B }, imagePrompt: "A glowing oil-drop with golden radiance" + ART },
];

export function presetByKey(key: string): ScreenerPreset | undefined {
  return PRESETS.find((p) => p.key === key);
}

// "More like this": same-category presets first, then fill from the rest, never
// including the selected one. Deterministic order (catalog order).
export function relatedPresets(key: string, n = 6): ScreenerPreset[] {
  const self = presetByKey(key);
  if (!self) return PRESETS.slice(0, n);
  const sameCat = PRESETS.filter((p) => p.key !== key && p.category === self.category);
  const others = PRESETS.filter((p) => p.key !== key && p.category !== self.category);
  return [...sameCat, ...others].slice(0, n);
}

export const PRESET_KEYS = PRESETS.map((p) => p.key);
