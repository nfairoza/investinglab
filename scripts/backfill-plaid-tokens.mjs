// One-time backfill: encrypt any plaintext Plaid access tokens (P1.2).
//
// Reads plaid_items rows that still have a plaintext access_token, encrypts each
// with AES-256-GCM (same scheme as lib/secrets.ts), writes access_token_enc/iv,
// and NULLs the plaintext column. Idempotent — rows already encrypted are skipped.
//
// Run once after applying migration 0021 and setting SECRETS_ENCRYPTION_KEY:
//   node scripts/backfill-plaid-tokens.mjs
//
// Requires env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, SECRETS_ENCRYPTION_KEY

import { createClient } from "@supabase/supabase-js";
import { createCipheriv, randomBytes } from "crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const encB64 = process.env.SECRETS_ENCRYPTION_KEY;

if (!url || !key) { console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY"); process.exit(1); }
if (!encB64) { console.error("Missing SECRETS_ENCRYPTION_KEY (openssl rand -base64 32)"); process.exit(1); }
const encKey = Buffer.from(encB64, "base64");
if (encKey.length !== 32) { console.error("SECRETS_ENCRYPTION_KEY must decode to 32 bytes"); process.exit(1); }

function encrypt(plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encKey, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: Buffer.concat([enc, tag]).toString("base64"), iv: iv.toString("base64") };
}

const db = createClient(url, key, { auth: { persistSession: false } });

const { data: rows, error } = await db
  .from("plaid_items")
  .select("item_id, access_token, access_token_enc")
  .not("access_token", "is", null);

if (error) { console.error("Read failed:", error.message); process.exit(1); }

let done = 0, skipped = 0;
for (const r of rows ?? []) {
  if (r.access_token_enc) { skipped++; continue; } // already encrypted
  const { ciphertext, iv } = encrypt(r.access_token);
  const { error: upErr } = await db
    .from("plaid_items")
    .update({ access_token_enc: ciphertext, access_token_iv: iv, access_token: null })
    .eq("item_id", r.item_id);
  if (upErr) { console.error(`item ${r.item_id} failed:`, upErr.message); continue; }
  done++;
}

console.log(`Backfill complete: ${done} encrypted, ${skipped} already-encrypted.`);
