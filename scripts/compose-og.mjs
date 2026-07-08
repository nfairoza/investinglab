// Compose the social/OG card (app/opengraph-image.png) by overlaying the
// wordmark + tagline onto the brand backdrop (public/art/og-backdrop@1x.png).
//
// Why static + sharp rather than a dynamic next/og route: @vercel/og fails to
// prerender during `next build` on some platforms (fileURLToPath on a font URL),
// and a link-preview card doesn't need to be dynamic. Baking it once keeps the
// build deterministic and gives scrapers a plain PNG. Re-run after changing the
// backdrop or copy:  node scripts/compose-og.mjs
import sharp from "sharp";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const W = 1200, H = 630;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const bg = await sharp(join(root, "public/art/og-backdrop@1x.png"))
  .resize(W, H, { fit: "cover" })
  .toBuffer();

const svg = `<svg width='${W}' height='${H}' xmlns='http://www.w3.org/2000/svg'>
  <style>
    .wm{font-family:'Segoe UI',Arial,sans-serif;font-weight:800;font-size:88px;letter-spacing:-3px}
    .sub{font-family:'Segoe UI',Arial,sans-serif;font-weight:500;font-size:34px}
    .fine{font-family:'Segoe UI',Arial,sans-serif;font-weight:400;font-size:22px}
  </style>
  <text x='80' y='300' class='wm'><tspan fill='#F7F8FA'>ruk</tspan><tspan fill='#16D27E'>Money</tspan></text>
  <text x='82' y='360' class='sub' fill='#A9B2BD'>${esc("Your banks, brokerages, and whole financial life —")}</text>
  <text x='82' y='406' class='sub' fill='#A9B2BD'>${esc("unified and understood by AI.")}</text>
  <text x='82' y='470' class='fine' fill='#5B6673'>${esc("Research & education · Not financial advice")}</text>
</svg>`;

await sharp(bg)
  .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
  .png({ compressionLevel: 9 })
  .toFile(join(root, "app/opengraph-image.png"));

console.log("wrote app/opengraph-image.png (1200x630)");
