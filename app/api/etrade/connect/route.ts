import { NextResponse } from "next/server";
import { fetchRequestToken, AUTH_URL, hasConsumerKey, getConsumerKey } from "@/lib/etrade/client";
import { setRequestToken } from "@/lib/etrade/token-store";
import { getAdminClient } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

// GET /api/etrade/connect
// Starts the OAuth 1.0a flow: fetches a request token and returns the
// E*TRADE authorization URL for the browser to redirect to.
export async function GET(req: Request) {
  if (!(await getAdminClient())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!hasConsumerKey()) {
    return NextResponse.json(
      { error: "ETRADE_CONSUMER_KEY and ETRADE_CONSUMER_SECRET must be set in .env.local or the Connectors tab." },
      { status: 400 },
    );
  }

  try {
    // E*TRADE uses the out-of-band flow — no callback URL (it rejects them).
    const { token, secret } = await fetchRequestToken();
    setRequestToken(token, secret);

    // Opens E*TRADE's authorize page; after consent it shows a verification
    // code the user pastes back (POST /api/etrade/verify).
    const authorizeUrl = `${AUTH_URL}?key=${encodeURIComponent(getConsumerKey())}&token=${encodeURIComponent(token)}`;
    return NextResponse.json({ authorizeUrl });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to start E*TRADE OAuth flow" },
      { status: 500 },
    );
  }
}
