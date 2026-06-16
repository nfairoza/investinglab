// Server-only, in-memory holder for an AI key entered at runtime via Settings.
// This lets you paste a Claude key in the UI for LOCAL testing without editing
// .env. It lives in the server process only — it is never sent to the browser
// and does NOT persist across restarts or across serverless instances.
//
// For real deployment, set ANTHROPIC_API_KEY in the environment instead, or
// store per-user keys encrypted in the database once auth is wired.

let runtimeKey: string | null = null;
let runtimeModel: string | null = null;

export function setRuntimeAi(key: string | null, model: string | null): void {
  runtimeKey = key && key.trim() ? key.trim() : null;
  runtimeModel = model && model.trim() ? model.trim() : null;
}

export function getRuntimeKey(): string | null {
  return runtimeKey;
}

export function getRuntimeModel(): string | null {
  return runtimeModel;
}
