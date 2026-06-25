// Shared "daily-ish" freshness check: a cached value is stale once it predates
// the most recent 8am America/New_York boundary OR is older than maxAgeMs
// (default 12h), whichever is hit first. Used by shared caches (research memos,
// preset rankings) so they refresh each market morning but also cap staleness.

function etOffsetMinutes(nowMs: number): number {
  const d = new Date(nowMs);
  const utc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
  const et = new Date(d.toLocaleString("en-US", { timeZone: "America/New_York" }));
  return Math.round((et.getTime() - utc.getTime()) / 60_000);
}

// Epoch ms of the most recent 8am ET boundary at or before nowMs.
export function last8amEastEpoch(nowMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit",
  }).formatToParts(new Date(nowMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const y = get("year"), mo = get("month"), d = get("day"), h = get("hour");
  const offMin = etOffsetMinutes(nowMs);
  let boundary = Date.UTC(y, mo - 1, d, 8, 0, 0) - offMin * 60_000;
  if (h < 8) boundary -= 24 * 60 * 60 * 1000;
  return boundary;
}

export function isDailyStale(generatedAt: string | null, maxAgeMs = 12 * 60 * 60 * 1000, nowMs = Date.now()): boolean {
  if (!generatedAt) return true;
  const t = new Date(generatedAt).getTime();
  if (Number.isNaN(t)) return true;
  if (t < last8amEastEpoch(nowMs)) return true;        // crossed the morning boundary
  if (nowMs - t > maxAgeMs) return true;                // older than the cap
  return false;
}
