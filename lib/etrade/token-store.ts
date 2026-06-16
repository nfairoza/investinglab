// E*TRADE OAuth token store — PERSISTED to data/db.json (not in-memory).
//
// Why persisted: Next.js dev mode reloads route modules between requests, which
// resets module-level variables. With an in-memory store, the access token saved
// during /verify would vanish before /status or /positions ran — which is why
// "select account" did nothing and Holdings showed "no account selected".
// db.json is gitignored, so tokens still never leave your machine or hit GitHub.
// Tokens expire at midnight ET; callers detect 401 and surface a reconnect prompt.
//
// Writes are SYNCHRONOUS (getDb().write()) because within a single request the
// code writes then immediately reads (e.g. /verify sets the access token then
// calls the accounts endpoint). E*TRADE writes are low-frequency and sequential.

import { getDb, EMPTY_ETRADE } from "@/lib/db";

export interface EtradeAccount {
  accountId: string;
  accountIdKey: string;
  accountName: string;
  accountType: string;
  institutionType: string;
}

function writeEtrade(mutate: (e: typeof EMPTY_ETRADE) => void): void {
  const db = getDb();
  mutate(db.data.etrade);
  db.write();
}

export function setRequestToken(token: string, secret: string): void {
  writeEtrade((e) => {
    e.requestToken = token;
    e.requestTokenSecret = secret;
  });
}

export function getRequestToken(): { token: string; secret: string } | null {
  const e = getDb().data.etrade;
  if (!e.requestToken || !e.requestTokenSecret) return null;
  return { token: e.requestToken, secret: e.requestTokenSecret };
}

export function setAccessTokens(token: string, secret: string): void {
  writeEtrade((e) => {
    e.accessToken = token;
    e.accessTokenSecret = secret;
    e.requestToken = null;
    e.requestTokenSecret = null;
    e.connectedAt = new Date().toISOString();
  });
}

export function getAccessTokens(): { token: string; secret: string } | null {
  const e = getDb().data.etrade;
  if (!e.accessToken || !e.accessTokenSecret) return null;
  return { token: e.accessToken, secret: e.accessTokenSecret };
}

export function setAccounts(accounts: EtradeAccount[]): void {
  writeEtrade((e) => {
    e.accounts = accounts;
  });
}

export function getAccounts(): EtradeAccount[] {
  return (getDb().data.etrade.accounts as EtradeAccount[]) ?? [];
}

export function setSelectedAccount(accountIdKey: string): void {
  writeEtrade((e) => {
    e.selectedAccountIdKey = accountIdKey;
  });
}

export function getSelectedAccountIdKey(): string | null {
  return getDb().data.etrade.selectedAccountIdKey;
}

export function isConnected(): boolean {
  const e = getDb().data.etrade;
  return Boolean(e.accessToken && e.accessTokenSecret);
}

export function getConnectedAt(): string | null {
  return getDb().data.etrade.connectedAt;
}

export function clearAll(): void {
  writeEtrade((e) => {
    e.requestToken = null;
    e.requestTokenSecret = null;
    e.accessToken = null;
    e.accessTokenSecret = null;
    e.accounts = [];
    e.selectedAccountIdKey = null;
    e.connectedAt = null;
  });
}
