import { NextResponse } from "next/server";
import { fetchRequestToken, AUTH_URL, hasConsumerKey, getConsumerKey } from "@/lib/etrade/client";
import { getBrokerCtx, writeBrokerConnection } from "@/lib/broker-store";

export const dynamic = "force-dynamic";

// GET /api/etrade/connect
// Starts the OAuth 1.0a flow for the CURRENT user: fetches a request token,
// stores it in that user's broker_connections row, and returns the E*TRADE
// authorization URL for the browser to redirect to.
export async function GET() {
  const ctx = await getBrokerCtx();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasConsumerKey()) {
    return NextResponse.json(
      { error: "E*TRADE app credentials are not configured. Ask the administrator to set them." },
      { status: 400 },
    );
  }

  try {
    // E*TRADE uses the out-of-band flow — no callback URL (it rejects them).
    const { token, secret } = await fetchRequestToken();
    await writeBrokerConnection(ctx, "etrade", { requestToken: token, requestTokenSecret: secret });

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
