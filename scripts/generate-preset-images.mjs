// Generate preset imagery via Gemini (AI Studio), in TWO sizes:
//   public/images/presets/<key>.jpg       256px square thumbnail (screener tiles)
//   public/images/presets-hero/<key>.jpg  768px square hero (list detail page)
//
// Run once (admin): node scripts/generate-preset-images.mjs
// Requires GEMINI_API_KEY in env or .env.local (gitignored), and `sharp`
// (npm install --no-save sharp). SKIPS a preset only if BOTH outputs exist, so a
// re-run fills in newly-added presets. Uses gemini-2.5-flash-image (returns
// inline base64). The app NEVER calls the image API at request time.
//
// Preset keys + prompts are read from lib/screener/presets.ts. Since that's TS,
// we parse the key/imagePrompt pairs out of the source rather than importing.

import { mkdirSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const THUMB = join(root, "public", "images", "presets");
const HERO = join(root, "public", "images", "presets-hero");
mkdirSync(THUMB, { recursive: true });
mkdirSync(HERO, { recursive: true });

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
  const thumb = join(THUMB, `${key}.jpg`);
  const hero = join(HERO, `${key}.jpg`);
  if (existsSync(thumb) && existsSync(hero)) { console.log(`• ${key} (exists, skip)`); return; }
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    { method: "POST", headers: { "Content-Type": "application/json", "X-goog-api-key": KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) },
  );
  if (!r.ok) { console.error(`${key}: HTTP ${r.status}`, (await r.text()).slice(0, 160)); return; }
  const j = await r.json();
  const img = (j.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
  if (!img) { console.error(`${key}: no image in response`); return; }
  const raw = Buffer.from(img.inlineData.data, "base64");
  // Hero: 768px, higher quality (shown large). Thumb: 256px (shown tiny).
  await sharp(raw).resize(768, 768, { fit: "cover" }).jpeg({ quality: 86, mozjpeg: true }).toFile(hero);
  await sharp(raw).resize(256, 256, { fit: "cover" }).jpeg({ quality: 80, mozjpeg: true }).toFile(thumb);
  console.log(`✓ ${key}`);
}

for (const e of entries) await gen(e.prompt, e.key);
console.log("Done.");
