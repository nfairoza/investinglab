// Server-only in-memory store for E*TRADE OAuth tokens.
// Same pattern as lib/connectors/runtime.ts — nothing ever leaves the server.
// Tokens expire at midnight ET; caller detects 401 and surfaces a reconnect button.

interface TokenState {
  // Step 1 temporary tokens (discarded after access token exchange)
  requestToken: string | null;
  requestTokenSecret: string | null;
  // Step 4 long-lived tokens (until midnight ET or inactivity)
  accessToken: string | null;
  accessTokenSecret: string | null;
  // Cached account list from first successful auth
  accounts: EtradeAccount[];
  selectedAccountIdKey: string | null;
  connectedAt: string | null; // ISO — shown in the UI
}

export interface EtradeAccount {
  accountId: string;
  accountIdKey: string;
  accountName: string;
  accountType: string;
  institutionType: string;
}

const state: TokenState = {
  requestToken: null,
  requestTokenSecret: null,
  accessToken: null,
  accessTokenSecret: null,
  accounts: [],
  selectedAccountIdKey: null,
  connectedAt: null,
};

export function setRequestToken(token: string, secret: string): void {
  state.requestToken = token;
  state.requestTokenSecret = secret;
}

export function getRequestToken(): { token: string; secret: string } | null {
  if (!state.requestToken || !state.requestTokenSecret) return null;
  return { token: state.requestToken, secret: state.requestTokenSecret };
}

export function setAccessTokens(token: string, secret: string): void {
  state.accessToken = token;
  state.accessTokenSecret = secret;
  state.requestToken = null;
  state.requestTokenSecret = null;
  state.connectedAt = new Date().toISOString();
}

export function getAccessTokens(): { token: string; secret: string } | null {
  if (!state.accessToken || !state.accessTokenSecret) return null;
  return { token: state.accessToken, secret: state.accessTokenSecret };
}

export function setAccounts(accounts: EtradeAccount[]): void {
  state.accounts = accounts;
}

export function getAccounts(): EtradeAccount[] {
  return state.accounts;
}

export function setSelectedAccount(accountIdKey: string): void {
  state.selectedAccountIdKey = accountIdKey;
}

export function getSelectedAccountIdKey(): string | null {
  return state.selectedAccountIdKey;
}

export function isConnected(): boolean {
  return Boolean(state.accessToken && state.accessTokenSecret);
}

export function getConnectedAt(): string | null {
  return state.connectedAt;
}

export function clearAll(): void {
  state.requestToken = null;
  state.requestTokenSecret = null;
  state.accessToken = null;
  state.accessTokenSecret = null;
  state.accounts = [];
  state.selectedAccountIdKey = null;
  state.connectedAt = null;
}
