import { powerServiceClient } from "@/lib/power-trades/config";
import { routeText } from "@/lib/ai/router";
import { parseLooseJson } from "@/lib/ai/json";
import { screenStocks } from "@/lib/providers";
import { PRESETS, PRESET_KEYS } from "./presets";

// =============================================================================
// Daily AI ranking of screener presets. ONE shared call ranks presets for all
// users; cached in screener_preset_rankings and reused until it goes stale at
// the next 8am America/New_York boundary. Admin can force a re-rank.
//
// Honesty: the AI only ORDERS existing preset keys — any key it returns that
// isn't in the catalog is dropped, and if the AI/market step fails we fall back
// to a sensible static order, so the page always works and never invents presets.
// =============================================================================

export interface RankingResult {
  rankedKeys: string[];
  rationale: string | null;
  marketNote: string | null;
  generatedAt: string;
}

// Most recent 8am ET boundary, as epoch ms. We compare the cache's generatedAt
// to this: anything generated before today's 8am ET is stale.
function last8amEastEpoch(nowMs: number): number {
  // ET is UTC-5 (EST) or UTC-4 (EDT). Derive the offset from the current date
  // via Intl, so we don't hardcode DST. 8am ET = 8:00 local in America/New_York.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit",
  });
  const parts = fmt.formatToParts(new Date(nowMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const y = get("year"), mo = get("month"), d = get("day"), h = get("hour");
  // Build 8am ET for "today in ET" as a UTC instant by measuring the zone offset.
  const etOffsetMin = etOffsetMinutes(nowMs);
  // 8:00 ET today → UTC ms
  let boundary = Date.UTC(y, mo - 1, d, 8, 0, 0) - etOffsetMin * 60_000;
  // If it's before 8am ET right now, the most recent boundary was yesterday.
  if (h < 8) boundary -= 24 * 60 * 60 * 1000;
  return boundary;
}

// Minutes that America/New_York is offset from UTC at the given instant
// (negative, e.g. -300 for EST, -240 for EDT).
function etOffsetMinutes(nowMs: number): number {
  const d = new Date(nowMs);
  const utc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
  const et = new Date(d.toLocaleString("en-US", { timeZone: "America/New_York" }));
  return Math.round((et.getTime() - utc.getTime()) / 60_000);
}

export function isStale(generatedAt: string | null, nowMs = Date.now()): boolean {
  if (!generatedAt) return true;
  return new Date(generatedAt).getTime() < last8amEastEpoch(nowMs);
}

// A static, sensible default order used as fallback (quality/large first, then
// momentum, dividend, sectors, smaller/speculative last).
function staticOrder(): string[] {
  const weight: Record<string, number> = {
    quality: 0, value: 1, dividend: 2, income: 2, momentum: 3, growth: 3,
    sector: 4, size: 5, volatility: 6, speculative: 7,
  };
  return [...PRESETS].sort((a, b) => (weight[a.category] ?? 9) - (weight[b.category] ?? 9)).map((p) => p.key);
}

// Compact market snapshot: how many names currently pass a few representative
// screens. Cheap (FMP layer caches 90s + dedupes) and gives the AI a real,
// current sense of what's "working" without any new provider.
async function marketSnapshot(): Promise<string> {
  const probes: { label: string; filters: Parameters<typeof screenStocks>[0] }[] = [
    { label: "high-momentum (beta>1.5, vol>2M)", filters: { betaMoreThan: 1.5, volumeMoreThan: 2_000_000, marketCapMoreThan: 1_000_000_000, limit: 200 } },
    { label: "low-volatility (beta<0.8)", filters: { betaLowerThan: 0.8, marketCapMoreThan: 5_000_000_000, limit: 200 } },
    { label: "dividend payers (div>3)", filters: { dividendMoreThan: 3, marketCapMoreThan: 5_000_000_000, limit: 200 } },
    { label: "technology sector", filters: { sector: "Technology", marketCapMoreThan: 2_000_000_000, limit: 200 } },
    { label: "energy sector", filters: { sector: "Energy", marketCapMoreThan: 2_000_000_000, limit: 200 } },
  ];
  const lines: string[] = [];
  for (const p of probes) {
    try {
      const r = await screenStocks(p.filters);
      const rows = r.data ?? [];
      const up = rows.filter((x) => (x.changePct ?? 0) > 0).length;
      lines.push(`${p.label}: ${rows.length} matches, ${rows.length ? Math.round((up / rows.length) * 100) : 0}% up today`);
    } catch {
      lines.push(`${p.label}: unavailable`);
    }
  }
  return lines.join("\n");
}

export async function rankPresets(force = false): Promise<RankingResult> {
  const sb = powerServiceClient();
  // No DB → just hand back the static order (page still works).
  if (!sb) return { rankedKeys: staticOrder(), rationale: null, marketNote: null, generatedAt: new Date().toISOString() };

  const { data: existing } = await sb.from("screener_preset_rankings").select("*").eq("id", "global").maybeSingle();
  if (!force && existing && !isStale(existing.generated_at)) {
    const valid = (existing.ranked_keys as string[] ?? []).filter((k) => PRESET_KEYS.includes(k));
    // Append any catalog keys not in the cached order (e.g. presets added since).
    const ordered = [...valid, ...PRESET_KEYS.filter((k) => !valid.includes(k))];
    return { rankedKeys: ordered, rationale: existing.rationale ?? null, marketNote: existing.market_note ?? null, generatedAt: existing.generated_at };
  }

  // Regenerate.
  let rankedKeys = staticOrder();
  let rationale: string | null = null;
  let marketNote: string | null = null;
  try {
    marketNote = await marketSnapshot();
    const catalog = PRESETS.map((p) => `${p.key} | ${p.label} | ${p.category} | ${p.blurb}`).join("\n");
    const system = "You are a markets analyst choosing which stock-screener presets are most relevant TODAY for a general investing audience, given current market conditions. Favor presets that fit what is working now, keep a balanced mix, and put broadly useful presets near the top and niche/speculative ones lower. Respond ONLY with JSON.";
    const user = `Current market snapshot (live screen counts):\n${marketNote}\n\nAvailable presets (key | label | category | blurb):\n${catalog}\n\nReturn JSON: { "rankedKeys": ["key1","key2", ... all keys, best first], "rationale": "one sentence on why these are emphasized today" }. Use ONLY keys from the list. Include every key exactly once.`;
    const res = await routeText({ task: "structured", system, user, maxTokens: 2000 });
    const parsed = parseLooseJson(res.text) as { rankedKeys?: string[]; rationale?: string };
    const valid = (parsed.rankedKeys ?? []).filter((k) => PRESET_KEYS.includes(k));
    if (valid.length >= Math.floor(PRESET_KEYS.length / 2)) {
      // Trust the AI order; append any missing keys so none are lost.
      rankedKeys = [...valid.filter((k, i) => valid.indexOf(k) === i), ...PRESET_KEYS.filter((k) => !valid.includes(k))];
      rationale = typeof parsed.rationale === "string" ? parsed.rationale.slice(0, 300) : null;
    }
  } catch {
    // keep static order + whatever marketNote we got
  }

  const generatedAt = new Date().toISOString();
  await sb.from("screener_preset_rankings").upsert(
    { id: "global", ranked_keys: rankedKeys, rationale, market_note: marketNote, generated_at: generatedAt },
    { onConflict: "id" },
  ).then(() => {}, () => {});

  return { rankedKeys, rationale, marketNote, generatedAt };
}
