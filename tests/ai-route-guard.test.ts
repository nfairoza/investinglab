import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// AIEFF3 — regression guard: no unguarded AI routes, ever again.
//
// Every route under app/api that invokes a model MUST also cache or rate-guard
// that call. Without this, a new AI route can ship that spends tokens on every
// request with no cache and no per-user limit — exactly the class of leak this
// pass is closing (watchlist/enrich had zero caching; congress/alpha cached only
// in per-instance memory). This test scans the real tree statically and fails the
// build if a route calls AI but does neither.
//
// "Calls AI" = imports routeText/routeAi, OR hits the Anthropic/Gemini HTTP
//   endpoints directly, OR calls a known low-level client helper.
// "Guarded"  = the file also contains a durable cache read (server_cache /
//   shared_ table / readServerCache), a daily-stale gate (isDailyStale), or a
//   rate guard (guardAiRate / rateLimit).

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const API_DIR = join(ROOT, "app", "api");

// Intentional exceptions: routes that legitimately call AI without caching or
// rate-guarding. Each needs a one-line justification. Target: EMPTY.
// Format: "app/api/<path>/route.ts": "why".
const ALLOWLIST: Record<string, string> = {
  // Admin-only connectivity diagnostic: a fixed 8-token "ping" to each provider so
  // you can see which key works. Caching would defeat its purpose (it must hit the
  // live API), and it's not user-triggered en masse — it's a manual test button in
  // Settings. Not a token-leak surface.
  "app/api/ai/test/route.ts": "admin connectivity diagnostic — fixed 8-token ping, must hit live API",
};

// Signals that a file talks to a model provider.
const AI_SIGNALS = [
  /\brouteText\s*\(/,
  /\brouteAi\s*\(/,
  /from\s+["']@\/lib\/ai\/router["']/,
  /api\.anthropic\.com/,
  /generativelanguage\.googleapis\.com/,
  /\bcallGemini\s*\(/,
  /\bstreamGemini\s*\(/,
  /\bcallClaude\w*\s*\(/,
];

// Signals that the file caches or rate-guards its AI usage.
const GUARD_SIGNALS = [
  /\bguardAiRate\s*\(/,
  /\brateLimit\s*\(/,
  /\bisDailyStale\s*\(/,
  /\breadServerCache\s*\(/,
  /\bwriteServerCache\s*\(/,
  /\breadAiCache\s*\(/,    // per-user TTL cache in user_prefs.ai_cache
  /\bwriteAiCache\s*\(/,
  /\bserver_cache\b/,
  /shared_\w+/,           // shared_research / shared_prediction tables
  /from\s+["']@\/lib\/server-cache["']/,
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name === "route.ts") out.push(full);
  }
  return out;
}

function relKey(full: string): string {
  return full.slice(ROOT.length).replace(/\\/g, "/").replace(/^\//, "");
}

const routeFiles = walk(API_DIR);

describe("AI route guard", () => {
  it("scans a non-trivial number of API routes (sanity)", () => {
    expect(routeFiles.length).toBeGreaterThan(10);
  });

  it("every AI route caches or rate-guards its model calls", () => {
    const offenders: string[] = [];
    for (const full of routeFiles) {
      const src = readFileSync(full, "utf8");
      const usesAi = AI_SIGNALS.some((re) => re.test(src));
      if (!usesAi) continue;
      const guarded = GUARD_SIGNALS.some((re) => re.test(src));
      const key = relKey(full);
      if (!guarded && !(key in ALLOWLIST)) offenders.push(key);
    }
    if (offenders.length) {
      throw new Error(
        `Unguarded AI route(s) — each calls a model but has NO cache/shared_ read, ` +
        `isDailyStale, or guardAiRate. Add caching or rate-guarding, or (last resort) ` +
        `add an entry with justification to ALLOWLIST in tests/ai-route-guard.test.ts:\n` +
        offenders.map((o) => `  - ${o}`).join("\n"),
      );
    }
    expect(offenders).toEqual([]);
  });

  it("allowlist entries still exist and still call AI (no stale exceptions)", () => {
    for (const key of Object.keys(ALLOWLIST)) {
      const full = join(ROOT, key);
      const src = readFileSync(full, "utf8"); // throws if the file was moved/removed
      expect(AI_SIGNALS.some((re) => re.test(src))).toBe(true);
    }
  });

  // AIOPT A8 — every routeText call passes an explicit `task` (no reliance on a
  // default tier). Scans lib/ + app/ for routeText( invocations and asserts each
  // call's argument object literal contains `task:`. Catches a new call site that
  // forgets to classify its work and silently pays the wrong tier.
  it("every routeText call passes an explicit task", () => {
    const dirs = [join(ROOT, "lib"), join(ROOT, "app")];
    const offenders: string[] = [];
    const walkTs = (dir: string): string[] => {
      const out: string[] = [];
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) out.push(...walkTs(full));
        else if (name.endsWith(".ts") || name.endsWith(".tsx")) out.push(full);
      }
      return out;
    };
    for (const full of [...walkTs(dirs[0]), ...walkTs(dirs[1])]) {
      const src = readFileSync(full, "utf8");
      // For each routeText( occurrence, grab the following ~400 chars and require
      // a `task:` key before the call's likely close. Cheap + good enough.
      let idx = src.indexOf("routeText(");
      while (idx !== -1) {
        const window = src.slice(idx, idx + 400);
        // Skip the definition/import lines (they don't pass args).
        if (!/function routeText|import|export/.test(src.slice(Math.max(0, idx - 30), idx)) && !/\btask\s*:/.test(window)) {
          offenders.push(relKey(full));
        }
        idx = src.indexOf("routeText(", idx + 1);
      }
    }
    if (offenders.length) {
      throw new Error(`routeText call(s) missing an explicit task: (AIOPT A8):\n${offenders.map((o) => `  - ${o}`).join("\n")}`);
    }
    expect(offenders).toEqual([]);
  });

  // The guard must actually FAIL on an unguarded route — prove the logic isn't
  // vacuously passing. We synthesize a route source in memory and run the same
  // checks against it (no file written).
  it("FAILS on a synthetic unguarded AI route fixture", () => {
    const badRoute = `
      import { routeText } from "@/lib/ai/router";
      export async function POST() {
        const { text } = await routeText({ task: "light", system: "s", user: "u" });
        return Response.json({ text });
      }`;
    const usesAi = AI_SIGNALS.some((re) => re.test(badRoute));
    const guarded = GUARD_SIGNALS.some((re) => re.test(badRoute));
    expect(usesAi).toBe(true);
    expect(guarded).toBe(false); // → this route would be flagged an offender

    // And a guarded version passes.
    const goodRoute = badRoute + `\n// guarded\nawait guardAiRate(ctx);`;
    expect(GUARD_SIGNALS.some((re) => re.test(goodRoute))).toBe(true);
  });
});
