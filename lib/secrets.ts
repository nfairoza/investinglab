import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// AES-256-GCM encrypt/decrypt for secrets at rest (P1.1/P1.2). The 32-byte key
// comes from SECRETS_ENCRYPTION_KEY (base64). Generate one with:
//   openssl rand -base64 32
//
// Output format keeps the GCM auth tag appended to the ciphertext (last 16
// bytes), with the IV stored separately. Both ciphertext and IV are base64.

const ALGO = "aes-256-gcm";
const IV_LEN = 12; // 96-bit nonce, recommended for GCM
const TAG_LEN = 16;

function key(): Buffer | null {
  const b64 = process.env.SECRETS_ENCRYPTION_KEY;
  if (!b64) return null;
  const k = Buffer.from(b64, "base64");
  if (k.length !== 32) {
    throw new Error("SECRETS_ENCRYPTION_KEY must decode to 32 bytes (use: openssl rand -base64 32)");
  }
  return k;
}

// True when encryption is configured. Callers can fall back to plaintext/env
// paths when this is false (e.g. local dev without the key set).
export function secretsConfigured(): boolean {
  return Boolean(process.env.SECRETS_ENCRYPTION_KEY);
}

export interface EncryptedSecret { ciphertext: string; iv: string }

export function encryptSecret(plaintext: string): EncryptedSecret {
  const k = key();
  if (!k) throw new Error("SECRETS_ENCRYPTION_KEY not set");
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, k, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([enc, tag]).toString("base64"),
    iv: iv.toString("base64"),
  };
}

export function decryptSecret(ciphertextB64: string, ivB64: string): string {
  const k = key();
  if (!k) throw new Error("SECRETS_ENCRYPTION_KEY not set");
  const raw = Buffer.from(ciphertextB64, "base64");
  const iv = Buffer.from(ivB64, "base64");
  const tag = raw.subarray(raw.length - TAG_LEN);
  const enc = raw.subarray(0, raw.length - TAG_LEN);
  const decipher = createDecipheriv(ALGO, k, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
