// Generate a short loopable ambient "AI working" video via Gemini Veo.
// Run once: node scripts/generate-video.mjs
// Writes public/videos/ai-working.mp4 (+ a poster frame note).
// Veo is async: submit → poll the long-running operation → download the file.

import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "public", "videos");
mkdirSync(OUT, { recursive: true });

let KEY = process.env.GEMINI_API_KEY;
if (!KEY) { try { KEY = readFileSync(join(root, ".env.local"), "utf8").match(/^GEMINI_API_KEY=(.+)$/m)?.[1]?.trim(); } catch {} }
if (!KEY) { console.error("GEMINI_API_KEY missing"); process.exit(1); }

const MODEL = "veo-3.1-fast-generate-preview";
const PROMPT =
  "Abstract dark fintech loading loop: slow-flowing violet and sage data-lines and drifting light particles over a deep graphite near-black (#0A0C0F) background, gentle parallax, very low motion, elegant minimal, seamlessly loopable, no text, no logos, cinematic, soft glow.";

async function main() {
  // 1) Submit the generation request.
  const submit = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:predictLongRunning`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
      body: JSON.stringify({
        instances: [{ prompt: PROMPT }],
        parameters: { aspectRatio: "16:9" },
      }),
    },
  );
  if (!submit.ok) { console.error("submit failed", submit.status, (await submit.text()).slice(0, 400)); process.exit(1); }
  const op = await submit.json();
  console.log("submitted:", op.name);

  // 2) Poll until done (Veo can take 1-3 min).
  let result = op;
  for (let i = 0; i < 40 && !result.done; i++) {
    await new Promise((r) => setTimeout(r, 10_000));
    const p = await fetch(`https://generativelanguage.googleapis.com/v1beta/${op.name}`, { headers: { "x-goog-api-key": KEY } });
    result = await p.json();
    console.log(`poll ${i + 1}: done=${result.done ?? false}`);
  }
  if (!result.done) { console.error("timed out waiting for video"); process.exit(1); }
  if (result.error) { console.error("generation error", JSON.stringify(result.error).slice(0, 400)); process.exit(1); }

  // 3) Find the file URI and download it.
  const vids = result.response?.generateVideoResponse?.generatedSamples
    || result.response?.generatedSamples
    || result.response?.videos
    || [];
  const uri = vids[0]?.video?.uri || vids[0]?.uri;
  if (!uri) { console.error("no video uri in response:", JSON.stringify(result.response).slice(0, 500)); process.exit(1); }

  const dl = await fetch(uri, { headers: { "x-goog-api-key": KEY } });
  if (!dl.ok) { console.error("download failed", dl.status); process.exit(1); }
  const buf = Buffer.from(await dl.arrayBuffer());
  writeFileSync(join(OUT, "ai-working.mp4"), buf);
  console.log(`✓ ai-working.mp4 (${(buf.length / 1024).toFixed(0)} KB)`);
}

main();
