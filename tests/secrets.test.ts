import { describe, it, expect, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";

// AES-256-GCM round-trip (P5). Set a key before importing lib/secrets so its
// env read succeeds.
beforeAll(() => {
  process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("secrets round-trip", () => {
  it("encrypt then decrypt returns the original", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/secrets");
    const plain = "sk-ant-super-secret-token-12345";
    const { ciphertext, iv } = encryptSecret(plain);
    expect(ciphertext).not.toContain(plain);
    expect(decryptSecret(ciphertext, iv)).toBe(plain);
  });

  it("distinct IVs make ciphertext non-deterministic", async () => {
    const { encryptSecret } = await import("@/lib/secrets");
    const a = encryptSecret("same-value");
    const b = encryptSecret("same-value");
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
  });

  it("tampered ciphertext fails the GCM auth check", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/secrets");
    const { ciphertext, iv } = encryptSecret("value");
    const raw = Buffer.from(ciphertext, "base64");
    raw[0] ^= 0xff; // flip a byte
    expect(() => decryptSecret(raw.toString("base64"), iv)).toThrow();
  });
});
