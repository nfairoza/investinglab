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

// Shared art direction appended to every prompt for cohesion.
const STYLE = " abstract botanical-meets-technical, soft jasmine-gold and sage-green light, fine grain, elegant and minimal, cinematic, painterly but refined, no text, no logos, high detail.";

const ASSETS = [
  {
    file: "hero-jasmine.jpg",
    prompt:
      "A wide cinematic banner: abstract jasmine vines dissolving into fine flowing data-lines and drifting light particles, dark moody background (#0B0F0D near-black with warm green undertone), soft golden rim light, generous dark negative space on the right for text overlay, 16:9." + STYLE,
  },
  {
    file: "hero-jasmine-light.jpg",
    prompt:
      "A wide cinematic banner, LIGHT airy version: abstract jasmine vines dissolving into fine flowing data-lines and soft light particles on a warm cream off-white background (#FAF7F0), gentle daylight, muted jasmine-gold and sage accents, lots of bright negative space on the right for text, 16:9." + STYLE,
  },
  {
    file: "bg-vines.png",
    prompt:
      "A seamless tileable texture of very faint thin jasmine vine and leaf line-art on near-black (#0B0F0D), extremely low contrast, sparse delicate gold and sage linework, subtle background texture overlay." + STYLE,
  },
  {
    file: "empty-jasmine.png",
    prompt:
      "A single elegant jasmine blossom with subtle fine circuit-board detail in the petals, centered with lots of negative space, on a dark charcoal-green background, soft golden glow, square." + STYLE,
  },
];

for (const a of ASSETS) await gen(a.prompt, a.file);
console.log("Done.");
