// Server-only, in-memory store for connector credentials entered at runtime via
// the Connectors page. Same model as the AI key: values are held in the server
// process for this dev session, never sent to the browser, gone on restart.
// For deployment, set the matching env vars instead.
//
// getConnectorValue() resolves runtime value first, then the environment, so a
// key added in the UI takes effect immediately and a key in .env keeps working.

const store: Record<string, string> = {};

export function setConnectorValues(values: Record<string, string | null>): void {
  for (const [field, value] of Object.entries(values)) {
    if (value && value.trim()) store[field] = value.trim();
    else delete store[field];
  }
}

export function getConnectorValue(field: string): string | null {
  if (store[field]) return store[field];
  const env = process.env[field];
  return env && env.trim() ? env : null;
}

export function runtimeHas(field: string): boolean {
  return Boolean(store[field]);
}
