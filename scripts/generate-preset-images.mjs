// Generate one image per screener preset via Gemini (AI Studio).
// Run once (admin): node scripts/generate-preset-images.mjs
// Requires GEMINI_API_KEY in env or .env.local (gitignored).
//
// Writes public/images/presets/<key>.jpg. SKIPS files that already exist, so a
// re-run only fills in newly-added presets. Uses gemini-2.5-flash-image (returns
// inline base64). The app NEVER calls the image API at request time — this is a
// one-time build step; commit the resulting images.
//
// Preset keys + prompts are read from lib/screener/presets.ts. Since that's TS,
// we parse the key/imagePrompt pairs out of the source rather than importing.

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "public", "images", "presets");
mkdirSync(OUT, { recursive: true });

let KEY = process.env.GEMINI_API_KEY;
if (!KEY) {
  try {
    const env = readFileSync(join(root, ".env.local"), "utf8");
    KEY = env.match(/^GEMINI_API_KEY=(.+)$/m)?.[1]?.trim();
  } catch {}
}
if (!KEY) { console.error("GEMINI_API_KEY not found in env or .env.local"); process.exit(1); }

const MODEL = "gemini-2.5-flash-image";

// Extract { key, imagePrompt } from the presets source. Prompts are built as
// `"..." + ART`, so we capture the leading string literal and append the ART
// constant ourselves (kept in sync with presets.ts).
const src = readFileSync(join(root, "lib", "screener", "presets.ts"), "utf8");
const ART = (src.match(/const ART = (".*?");/s)?.[1] ?? '""');
const artText = JSON.parse(ART);

const entries = [];
const re = /key:\s*"([^"]+)"[\s\S]*?imagePrompt:\s*"([^"]+)"\s*\+\s*ART\s*}/g;
let m;
while ((m = re.exec(src)) !== null) {
  entries.push({ key: m[1], prompt: m[2] + artText });
}
if (entries.length === 0) { console.error("No presets parsed from presets.ts"); process.exit(1); }
console.log(`Found ${entries.length} presets.`);

async function gen(prompt, key) {
  const file = join(OUT, `${key}.jpg`);
  if (existsSync(file)) { console.log(`• ${key} (exists, skip)`); return; }
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    { method: "POST", headers: { "Content-Type": "application/json", "X-goog-api-key": KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) },
  );
  if (!r.ok) { console.error(`${key}: HTTP ${r.status}`, (await r.text()).slice(0, 160)); return; }
  const j = await r.json();
  const img = (j.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
  if (!img) { console.error(`${key}: no image in response`); return; }
  writeFileSync(file, Buffer.from(img.inlineData.data, "base64"));
  console.log(`✓ ${key}`);
}

for (const e of entries) await gen(e.prompt, e.key);
console.log("Done.");
