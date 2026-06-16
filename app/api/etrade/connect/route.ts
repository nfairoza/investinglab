import { NextResponse } from "next/server";
import { fetchRequestToken, AUTH_URL, hasConsumerKey } from "@/lib/etrade/client";
import { setRequestToken } from "@/lib/etrade/token-store";

export const dynamic = "force-dynamic";

// GET /api/etrade/connect
// Starts the OAuth 1.0a flow: fetches a request token and returns the
// E*TRADE authorization URL for the browser to redirect to.
export async function GET(req: Request) {
  if (!hasConsumerKey()) {
    return NextResponse.json(
      { error: "ETRADE_CONSUMER_KEY and ETRADE_CONSUMER_SECRET must be set in .env.local or the Connectors tab." },
      { status: 400 },
    );
  }

  try {
    const origin = new URL(req.url).origin;
    const callbackUrl = `${origin}/api/etrade/callback`;
    const { token, secret } = await fetchRequestToken(callbackUrl);
    setRequestToken(token, secret);

    const authorizeUrl = `${AUTH_URL}?key=${process.env.ETRADE_CONSUMER_KEY}&token=${token}`;
    return NextResponse.json({ authorizeUrl });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to start E*TRADE OAuth flow" },
      { status: 500 },
    );
  }
}
