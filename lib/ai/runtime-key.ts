// Server-only, in-memory holder for an AI key entered at runtime via Settings.
// This lets you paste a Claude key in the UI for LOCAL testing without editing
// .env. It lives in the server process only — it is never sent to the browser
// and does NOT persist across restarts or across serverless instances.
//
// For real deployment, set ANTHROPIC_API_KEY in the environment instead, or
// store per-user keys encrypted in the database once auth is wired.

let runtimeKey: string | null = null;
let runtimeModel: string | null = null;
let runtimeStrategy: string | null = null;

export function setRuntimeAi(key: string | null, model: string | null): void {
  runtimeKey = key && key.trim() ? key.trim() : null;
  runtimeModel = model && model.trim() ? model.trim() : null;
}

// Routing strategy: "smart" (auto-pick per task), "quality" (always best),
// "economy" (prefer cheap). Persisted in-process for the session.
export function setRuntimeStrategy(strategy: string | null): void {
  runtimeStrategy = strategy && strategy.trim() ? strategy.trim() : null;
}
export function getRuntimeStrategy(): string | null {
  return runtimeStrategy;
}

// Set ONLY the model, leaving the key (from UI or .env) untouched. Lets the
// Settings model picker switch models without re-entering the API key.
export function setRuntimeModel(model: string | null): void {
  runtimeModel = model && model.trim() ? model.trim() : null;
}

export function getRuntimeKey(): string | null {
  return runtimeKey;
}

export function getRuntimeModel(): string | null {
  return runtimeModel;
}
