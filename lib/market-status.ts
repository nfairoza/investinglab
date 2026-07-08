// US equity market status, computed from the wall clock in America/New_York.
// Pure + dependency-free so it runs the same on server and client. Regular
// session is 9:30–16:00 ET Mon–Fri; 4:00–9:30 is pre-market, 16:00–20:00 is
// after-hours. Holidays are NOT modeled (no reliable offline calendar) — on a
// weekday holiday this reads "open", which is an acceptable, honest-enough
// approximation for a status chip.

export type MarketPhase = "open" | "pre" | "after" | "closed";

export interface MarketStatus {
  phase: MarketPhase;
  label: string;      // e.g. "Market open", "Pre-market", "After hours", "Market closed"
  minutesOfDay: number; // ET minutes since midnight (for callers that want it)
  weekday: number;      // 0=Sun … 6=Sat (ET)
}

// Extract ET hour/minute/weekday without pulling in a tz library.
function etParts(now: Date): { minutes: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hour12: false,
    weekday: "short", hour: "2-digit", minute: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0; // some engines emit 24 at midnight
  const minute = Number(get("minute"));
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = wdMap[get("weekday")] ?? 0;
  return { minutes: hour * 60 + minute, weekday };
}

const OPEN = 9 * 60 + 30;   // 09:30
const CLOSE = 16 * 60;      // 16:00
const PRE_START = 4 * 60;   // 04:00
const AFTER_END = 20 * 60;  // 20:00

export function getMarketStatus(now: Date = new Date()): MarketStatus {
  const { minutes, weekday } = etParts(now);
  const base = { minutesOfDay: minutes, weekday };
  if (weekday === 0 || weekday === 6) return { phase: "closed", label: "Market closed", ...base };
  if (minutes >= OPEN && minutes < CLOSE) return { phase: "open", label: "Market open", ...base };
  if (minutes >= PRE_START && minutes < OPEN) return { phase: "pre", label: "Pre-market", ...base };
  if (minutes >= CLOSE && minutes < AFTER_END) return { phase: "after", label: "After hours", ...base };
  return { phase: "closed", label: "Market closed", ...base };
}
