import { NextRequest, NextResponse } from "next/server";
import { fetchAccessToken, etradeGet } from "@/lib/etrade/client";
import { getRequestToken, setAccessTokens, setAccounts, type EtradeAccount } from "@/lib/etrade/token-store";

export const dynamic = "force-dynamic";

// GET /api/etrade/callback?oauth_token=...&oauth_verifier=...
// Called by E*TRADE after the user authorizes. Exchanges for an access token,
// fetches the account list, then redirects the browser back to /connectors.
export async function GET(req: NextRequest) {
  const oauthToken = req.nextUrl.searchParams.get("oauth_token");
  const oauthVerifier = req.nextUrl.searchParams.get("oauth_verifier");

  if (!oauthToken || !oauthVerifier) {
    return NextResponse.redirect(new URL("/connectors?etrade=error&reason=missing_params", req.url));
  }

  const stored = getRequestToken();
  if (!stored) {
    return NextResponse.redirect(new URL("/connectors?etrade=error&reason=no_request_token", req.url));
  }

  try {
    // Exchange for access token
    const { token, secret } = await fetchAccessToken(stored.token, stored.secret, oauthVerifier);
    setAccessTokens(token, secret);

    // Fetch account list and cache it
    const data = await etradeGet<any>("/accounts/list.json");
    const raw = data?.AccountListResponse?.Accounts?.Account ?? [];
    const accounts: EtradeAccount[] = (Array.isArray(raw) ? raw : [raw]).map((a: any) => ({
      accountId: String(a.accountId ?? ""),
      accountIdKey: String(a.accountIdKey ?? ""),
      accountName: String(a.accountDesc ?? a.accountName ?? a.accountId ?? ""),
      accountType: String(a.accountType ?? ""),
      institutionType: String(a.institutionType ?? ""),
    }));
    setAccounts(accounts);

    return NextResponse.redirect(new URL("/connectors?etrade=connected", req.url));
  } catch (e) {
    const msg = e instanceof Error ? encodeURIComponent(e.message.slice(0, 100)) : "unknown";
    return NextResponse.redirect(new URL(`/connectors?etrade=error&reason=${msg}`, req.url));
  }
}
