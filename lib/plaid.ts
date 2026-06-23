import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

// Server-only Plaid client. Credentials come from env (set in Vercel):
//   PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV ("production" | "sandbox").
// Never import this in client components — it carries the secret.

function plaidEnvName(): keyof typeof PlaidEnvironments {
  const v = (process.env.PLAID_ENV ?? "production").toLowerCase();
  if (v === "sandbox") return "sandbox";
  if (v === "development") return "development";
  return "production";
}

export function plaidConfigured(): boolean {
  return Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

let _client: PlaidApi | null = null;

export function getPlaid(): PlaidApi {
  if (_client) return _client;
  const configuration = new Configuration({
    basePath: PlaidEnvironments[plaidEnvName()],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
        "PLAID-SECRET": process.env.PLAID_SECRET,
      },
    },
  });
  _client = new PlaidApi(configuration);
  return _client;
}

// Products we request. All four per the user's choice (balances/auth, txns, investments).
export const PLAID_PRODUCTS = ["transactions", "investments"] as const;
export const PLAID_COUNTRY_CODES = ["US"] as const;
