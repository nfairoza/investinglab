// rukMoney artwork pipeline (ART1–ART3).
// Run: GEMINI_API_KEY=... node scripts/generate-art.mjs [name]
//   (optional [name] regenerates a single placement; omit for all.)
//
// For each placement: ask Gemini for the largest image, then post-process with
// sharp into AVIF + WebP + PNG at 1x AND 2x the display size (strip metadata,
// AVIF q~80). Writes to public/art/ and updates public/art/manifest.json so
// regeneration is reproducible (records name, placement, sizes, prompt).
//
// ONE style across every asset (ART2) is baked into STYLE below — the consistency
// is what reads as premium. No text, no faces, on-palette teal→green on charcoal.

import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "public", "art");
mkdirSync(OUT, { recursive: true });

const ENV = globalThis.process?.env ?? {};
const ARGV = globalThis.process?.argv ?? [];
const die = (code) => { if (typeof globalThis.process?.exit === "function") globalThis.process.exit(code); else throw new Error(`exit ${code}`); };
let KEY = ENV.GEMINI_API_KEY;
if (!KEY) {
  try { KEY = readFileSync(join(root, ".env.local"), "utf8").match(/^GEMINI_API_KEY=(.+)$/m)?.[1]?.trim(); } catch {}
}
if (!KEY) { console.error("GEMINI_API_KEY not found in env or .env.local"); die(1); }

const MODEL = "gemini-2.5-flash-image";

// ART2 — the single style guide, appended to every prompt.
const STYLE =
  " Style: dark charcoal near-black background (#0A0C0F), brand teal-to-green gradient accents (#0EA6C9 through #16D27E), thin luminous line-work with soft glow, abstract geometric/financial motifs, generous negative space, flat and minimal, premium fintech. Absolutely no text, no letters, no numbers, no human faces, no logos, no brand names. Centered composition with dark margins.";

// ART3 — placement inventory. `w`/`h` = display (1x) size; we also export 2x.
const PLACEMENTS = [
  // Empty states (480×360)
  { name: "empty-banks", placement: "empty:accounts", w: 480, h: 360, prompt: "Abstract: two faint interlocking geometric arches like a bridge between nodes, a single glowing link forming — 'connect an account'." },
  { name: "empty-watchlist", placement: "empty:watchlist", w: 480, h: 360, prompt: "Abstract: a sparse constellation of glowing data points connected by faint lines, one point brighter — a watchlist forming." },
  { name: "empty-transactions", placement: "empty:transactions", w: 480, h: 360, prompt: "Abstract: gentle horizontal flow lines drifting left to right with a few glowing dots, like a quiet ledger stream." },
  { name: "empty-journal", placement: "empty:journal", w: 480, h: 360, prompt: "Abstract: a single thin ascending path with faint milestone dots, generous empty space — a blank journal." },
  { name: "empty-alerts", placement: "empty:alerts", w: 480, h: 360, prompt: "Abstract: a radar-sweep motif — concentric faint arcs with one glowing point on the ring." },
  { name: "empty-follows", placement: "empty:follows", w: 480, h: 360, prompt: "Abstract: a small central node with faint orbit rings and a few unlit satellite points — nothing followed yet." },
  { name: "empty-screener", placement: "empty:screener", w: 480, h: 360, prompt: "Abstract: a faint grid of points with a soft luminous funnel narrowing to a few highlighted nodes — filtering." },
  { name: "empty-insights", placement: "empty:insights", w: 480, h: 360, prompt: "Abstract: a soft rising glow behind a thin upward line with a gentle spark at the crest — insight forming." },
  // Onboarding / persona (320×240)
  { name: "persona-money", placement: "persona:money", w: 320, h: 240, prompt: "Abstract: layered rounded bars/coins as stacked glowing plates with soft depth — tracking money." },
  { name: "persona-research", placement: "persona:research", w: 320, h: 240, prompt: "Abstract: a magnifier-like ring over a faint candlestick/line lattice — researching stocks." },
  { name: "persona-power", placement: "persona:power", w: 320, h: 240, prompt: "Abstract: a domed civic silhouette rendered as pure thin line-work with a glowing data pulse — following official trades." },
  // Login hero backdrop (1600×1200) — subtle, sits behind text.
  { name: "login-hero", placement: "login:hero", w: 1600, h: 1200, prompt: "Very subtle ambient backdrop: sweeping ascending gradient paths and a faint constellation across deep charcoal, low contrast so text overlays cleanly, most of the frame near-black." },
  // Weekly digest email header (1200×400) + compact (600×200)
  { name: "email-header", placement: "email:header", w: 1200, h: 400, prompt: "Wide banner: a gentle ascending line with soft glow and a few data points, lots of dark negative space for an overlaid heading." },
  { name: "email-compact", placement: "email:compact", w: 600, h: 200, prompt: "Compact wide banner: a thin luminous upward path across dark charcoal, minimal." },
  // OG/social backdrop (1200×630) — text overlaid in code via next/og.
  { name: "og-backdrop", placement: "og:card", w: 1200, h: 630, prompt: "Social-card backdrop: abstract ascending paths + faint grid on charcoal, balanced empty center-left for an overlaid wordmark, premium." },
  // Section divider accents (240×240)
  { name: "divider-portfolio", placement: "divider:portfolio", w: 240, h: 240, prompt: "Small square accent: a compact cluster of glowing allocation arcs (donut-like) in thin line-work." },
  { name: "divider-research", placement: "divider:research", w: 240, h: 240, prompt: "Small square accent: a compact candlestick/line lattice with one glowing node." },
  { name: "divider-money", placement: "divider:money", w: 240, h: 240, prompt: "Small square accent: compact stacked coin/bar plates with soft glow." },
  { name: "divider-power", placement: "divider:power", w: 240, h: 240, prompt: "Small square accent: a tiny domed civic silhouette in thin line-work with a data pulse." },
  { name: "divider-insights", placement: "divider:insights", w: 240, h: 240, prompt: "Small square accent: a soft rising spark above a thin upward line." },
];

async function generate(prompt) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt + STYLE }] }] }),
    },
  );
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const img = (j.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
  if (!img) throw new Error("no image in response");
  return Buffer.from(img.inlineData.data, "base64");
}

// Post-process one source buffer into AVIF/WebP at 1x + 2x, cover-fit to the
// placement aspect. Returns the list of files written.
//
// PNG is skipped for the app UI: every browser rukMoney targets supports AVIF or
// WebP, so a raster fallback is dead weight (~94% of the byte total). The ONE
// exception is the OG/social card: link scrapers (iMessage, LinkedIn, WhatsApp)
// still render WebP/AVIF unreliably, so og:image ships a 1x PNG too.
async function processImage(buf, p) {
  const files = [];
  for (const scale of [1, 2]) {
    const w = p.w * scale, h = p.h * scale;
    const base = sharp(buf).resize(w, h, { fit: "cover", position: "centre" }).withMetadata(false);
    const stem = `${p.name}@${scale}x`;
    await base.clone().avif({ quality: 80 }).toFile(join(OUT, `${stem}.avif`));
    await base.clone().webp({ quality: 82 }).toFile(join(OUT, `${stem}.webp`));
    files.push(`${stem}.avif`, `${stem}.webp`);
    if (p.placement === "og:card" && scale === 1) {
      await base.clone().png({ compressionLevel: 9 }).toFile(join(OUT, `${stem}.png`));
      files.push(`${stem}.png`);
    }
  }
  return files;
}

async function main() {
  const only = ARGV[2];
  const list = only ? PLACEMENTS.filter((p) => p.name === only) : PLACEMENTS;
  if (!list.length) { console.error(`No placement named "${only}".`); die(1); }

  const manifest = [];
  for (const p of list) {
    try {
      const buf = await generate(p.prompt);
      const files = await processImage(buf, p);
      manifest.push({ name: p.name, placement: p.placement, display: { w: p.w, h: p.h }, scales: [1, 2], files, prompt: p.prompt });
      console.log(`✓ ${p.name} (${files.length} files)`);
    } catch (e) {
      console.error(`✗ ${p.name}: ${e.message}`);
    }
  }

  // Merge into manifest.json (preserve entries not regenerated this run).
  let existing = [];
  try { existing = JSON.parse(readFileSync(join(OUT, "manifest.json"), "utf8")).assets ?? []; } catch {}
  const byName = new Map(existing.map((a) => [a.name, a]));
  for (const a of manifest) byName.set(a.name, a);
  writeFileSync(join(OUT, "manifest.json"),
    JSON.stringify({ style: STYLE.trim(), generatedWith: MODEL, assets: [...byName.values()] }, null, 2));
  console.log(`Manifest: ${byName.size} assets → public/art/manifest.json`);
}

main().catch((e) => { console.error(e); die(1); });
