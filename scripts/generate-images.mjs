// Generate the jasmine UI artwork via Gemini (AI Studio).
// Run once: node scripts/generate-images.mjs
// Requires GEMINI_API_KEY in .env.local (gitignored).
//
// Writes to public/images/. Re-run any time to refresh the look — tweak the
// prompts below. Uses gemini-2.5-flash-image (returns inline base64 PNG/JPEG).

import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "public", "images");
mkdirSync(OUT, { recursive: true });

// Read GEMINI_API_KEY from env or .env.local
let KEY = process.env.GEMINI_API_KEY;
if (!KEY) {
  try {
    const env = readFileSync(join(root, ".env.local"), "utf8");
    KEY = env.match(/^GEMINI_API_KEY=(.+)$/m)?.[1]?.trim();
  } catch {}
}
if (!KEY) {
  console.error("GEMINI_API_KEY not found in env or .env.local");
  process.exit(1);
}

const MODEL = "gemini-2.5-flash-image";

async function gen(prompt, file) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    },
  );
  if (!r.ok) {
    console.error(`${file}: HTTP ${r.status}`, (await r.text()).slice(0, 200));
    return;
  }
  const j = await r.json();
  const img = (j.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
  if (!img) {
    console.error(`${file}: no image in response`);
    return;
  }
  writeFileSync(join(OUT, file), Buffer.from(img.inlineData.data, "base64"));
  console.log(`✓ ${file}`);
}

const ASSETS = [
  {
    file: "hero-jasmine.jpg",
    prompt:
      "A cinematic, ultra-detailed photograph of delicate white jasmine flowers and dark green vines arranged on the left side, against a deep charcoal-green to near-black background. Soft warm golden rim lighting on the petals, luxurious and moody, lots of empty dark negative space on the right side for text overlay. Elegant, high-end, magazine quality, shallow depth of field. Wide 16:9 banner composition.",
  },
  {
    file: "bg-vines.png",
    prompt:
      "A seamless subtle decorative pattern of thin elegant jasmine vines and small white blossoms, line-art style, very faint, on a pure solid black background. Minimal, sparse, delicate gold and white linework. Texture overlay for a website background.",
  },
  {
    file: "empty-jasmine.png",
    prompt:
      "A single elegant white jasmine blossom with a few green leaves, centered, on a solid dark charcoal-green background, soft golden glow, minimal, high-end botanical illustration.",
  },
];

for (const a of ASSETS) await gen(a.prompt, a.file);
console.log("Done.");
