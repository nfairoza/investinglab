// Lightweight endpoint smoke test with timing output.
//
// Usage:
//   BASE_URL=http://localhost:3000 COOKIE="sb-...=...; rk_demo=1" node scripts/smoke.mjs
//
// - BASE_URL defaults to http://localhost:3000.
// - COOKIE is the auth cookie header for an ADMIN session (so /api/overview
//   returns its `timings` breakdown). A demo cookie (rk_demo=1) also works for a
//   warm read, but timings are admin-only.
//
// Prints per-endpoint wall-clock, and for /api/overview the server-side per-branch
// `timings` object. Fails (exit 1) if warm /api/overview exceeds the target.

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const COOKIE = process.env.COOKIE || "";
const OVERVIEW_TARGET_MS = Number(process.env.OVERVIEW_TARGET_MS || 800);

const endpoints = [
  "/api/me",
  "/api/overview",
  "/api/holdings",
  "/api/networth",
  "/api/quotes?symbols=AAPL,MSFT,NVDA",
];

async function hit(path, { redirect = "follow", noCookie = false } = {}) {
  const t0 = Date.now();
  let status = 0, json = null, err = null;
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: !noCookie && COOKIE ? { cookie: COOKIE } : {},
      redirect,
    });
    status = res.status;
    try { json = await res.json(); } catch { /* non-json */ }
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }
  return { path, ms: Date.now() - t0, status, json, err };
}

function fmtTimings(t) {
  if (!t || typeof t !== "object") return "(no timings — need an admin session)";
  return Object.entries(t)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}=${v}ms`)
    .join("  ");
}

async function main() {
  console.log(`Smoke test → ${BASE_URL}`);
  console.log(`Overview target: warm < ${OVERVIEW_TARGET_MS}ms\n`);

  // Warm the caches first (first hit fills snapshots / L2), then measure warm.
  await hit("/api/overview");

  let failed = false;
  for (const path of endpoints) {
    const r = await hit(path);
    const ok = r.status >= 200 && r.status < 400;
    console.log(`${ok ? "✓" : "✗"} ${path} — ${r.ms}ms (HTTP ${r.status})${r.err ? ` ERR ${r.err}` : ""}`);
    if (path === "/api/overview") {
      console.log(`    branches: ${fmtTimings(r.json?.timings)}`);
      const serverTotal = r.json?.timings?.total;
      if (typeof serverTotal === "number" && serverTotal > OVERVIEW_TARGET_MS) {
        console.log(`    ✗ overview server total ${serverTotal}ms exceeds ${OVERVIEW_TARGET_MS}ms target`);
        failed = true;
      }
    }
    if (!ok) failed = true;
  }

  // Self-authenticating API routes must return their OWN 401 JSON, never a 307
  // redirect to /login (the auth middleware must let /api/* pass through). Use
  // redirect:"manual" so a stray redirect surfaces as a 3xx instead of being
  // silently followed to the login page (which would 200).
  const cron = await hit("/api/cron/tick", { redirect: "manual", noCookie: true });
  const cronOk = cron.status === 401;
  console.log(`${cronOk ? "✓" : "✗"} /api/cron/tick (unauth) — HTTP ${cron.status} (want 401, not 307)`);
  if (!cronOk) {
    failed = true;
    if (cron.status >= 300 && cron.status < 400) {
      console.log("    ✗ got a redirect — middleware is intercepting the cron route before its bearer check");
    }
  }

  console.log(failed ? "\nSMOKE FAILED" : "\nSMOKE OK");
  process.exit(failed ? 1 : 0);
}

main();
