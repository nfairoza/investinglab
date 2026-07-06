// Server-side holder for the AI key/model/strategy entered at runtime via
// Settings. Held in process memory for fast SYNC reads, and (P1.1) persisted
// encrypted to app_secrets so it survives serverless cold starts.
//
// Never sent to the browser. For deployment you can also set ANTHROPIC_API_KEY /
// AI_MODEL / AI_STRATEGY in the environment; runtime values take precedence.

import { serviceClient } from "@/lib/service-client";
import { encryptSecret, decryptSecret, secretsConfigured } from "@/lib/secrets";

const KEY_FIELD = "ANTHROPIC_API_KEY";
const MODEL_FIELD = "AI_MODEL";
const STRATEGY_FIELD = "AI_STRATEGY";

let runtimeKey: string | null = null;
let runtimeModel: string | null = null;
let runtimeStrategy: string | null = null;

let hydrated = false;
let hydratedAt = 0;
const HYDRATE_TTL_MS = 60_000;

async function persist(field: string, value: string | null): Promise<void> {
  if (!secretsConfigured()) return;
  const db = serviceClient();
  if (!db) return;
  if (value) {
    const { ciphertext, iv } = encryptSecret(value);
    await db.from("app_secrets").upsert({ field, ciphertext, iv, updated_at: new Date().toISOString() }, { onConflict: "field" });
  } else {
    await db.from("app_secrets").delete().eq("field", field);
  }
}

// Load persisted AI settings into memory. Idempotent, TTL-guarded.
export async function hydrateAiRuntime(force = false): Promise<void> {
  if (!secretsConfigured()) return;
  if (!force && hydrated && Date.now() - hydratedAt < HYDRATE_TTL_MS) return;
  const db = serviceClient();
  if (!db) return;
  const { data } = await db.from("app_secrets").select("field, ciphertext, iv").in("field", [KEY_FIELD, MODEL_FIELD, STRATEGY_FIELD]);
  for (const row of data ?? []) {
    try {
      const v = decryptSecret((row as any).ciphertext, (row as any).iv);
      if ((row as any).field === KEY_FIELD) runtimeKey = v;
      else if ((row as any).field === MODEL_FIELD) runtimeModel = v;
      else if ((row as any).field === STRATEGY_FIELD) runtimeStrategy = v;
    } catch { /* skip corrupt */ }
  }
  hydrated = true;
  hydratedAt = Date.now();
}

export async function setRuntimeAi(key: string | null, model: string | null): Promise<void> {
  runtimeKey = key && key.trim() ? key.trim() : null;
  runtimeModel = model && model.trim() ? model.trim() : null;
  await persist(KEY_FIELD, runtimeKey);
  await persist(MODEL_FIELD, runtimeModel);
}

// Routing strategy: "smart" (auto-pick per task), "quality" (always best),
// "economy" (prefer cheap).
export async function setRuntimeStrategy(strategy: string | null): Promise<void> {
  runtimeStrategy = strategy && strategy.trim() ? strategy.trim() : null;
  await persist(STRATEGY_FIELD, runtimeStrategy);
}
export function getRuntimeStrategy(): string | null {
  return runtimeStrategy;
}

// Set ONLY the model, leaving the key untouched.
export async function setRuntimeModel(model: string | null): Promise<void> {
  runtimeModel = model && model.trim() ? model.trim() : null;
  await persist(MODEL_FIELD, runtimeModel);
}

export function getRuntimeKey(): string | null {
  return runtimeKey;
}

export function getRuntimeModel(): string | null {
  return runtimeModel;
}
