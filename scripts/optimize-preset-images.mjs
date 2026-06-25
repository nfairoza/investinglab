// One-off: downscale the generated preset images to small JPEGs.
// The generator returns 1024×1024 PNGs (~1MB each) saved as .jpg; these render
// as small circular thumbnails, so a 256px JPEG is plenty. Rewrites in place.
//
//   node scripts/optimize-preset-images.mjs
//
// Requires sharp (install with: npm install --no-save sharp).

import { readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(root, "public", "images", "presets");
const SIZE = 256;
const QUALITY = 80;

const files = readdirSync(DIR).filter((f) => f.endsWith(".jpg"));
let before = 0, after = 0;

for (const f of files) {
  const p = join(DIR, f);
  before += statSync(p).size;
  const buf = await sharp(p).resize(SIZE, SIZE, { fit: "cover" }).jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer();
  await sharp(buf).toFile(p);
  after += statSync(p).size;
  console.log(`✓ ${f}`);
}

const mb = (n) => `${(n / 1e6).toFixed(1)}MB`;
console.log(`\nDone. ${files.length} images: ${mb(before)} → ${mb(after)}`);
