import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";

// =============================================================================
// Error logging — captures user-facing failures to the `error_log` table for the
// Admin Portal. Uses the service-role key (bypasses RLS); the table has no
// policies so anon/auth keys can't touch it. Best-effort and non-throwing — a
// logging failure must never break the user's request.
// =============================================================================

export type ErrorCategory = "ai" | "market_data" | "plaid" | "auth" | "app" | "other";

export interface LogErrorInput {
  message: string;                  // raw error text (admins only)
  category?: ErrorCategory;
  section?: string;                 // e.g. "predict", "advisor", "research"
  statusCode?: number;
  path?: string;
  severity?: "error" | "warning" | "info";
  userId?: string | null;
  userEmail?: string | null;
  meta?: Record<string, unknown>;
}

function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false } });
}

// Heuristic category from a raw message when the caller didn't specify one.
function inferCategory(msg: string): ErrorCategory {
  const m = msg.toLowerCase();
  if (/gemini|claude|anthropic|openai|prepayment|credit|model|token|completion/.test(m)) return "ai";
  if (/fmp|quota|plan limit|market data|quote|financials|screener/.test(m)) return "market_data";
  if (/plaid|institution|item_login|link token|access_token/.test(m)) return "plaid";
  if (/auth|unauthorized|forbidden|session|sign ?in|login/.test(m)) return "auth";
  return "other";
}

// Fire-and-forget: log an error. Safe to await or not. Never throws.
export async function logError(input: LogErrorInput): Promise<void> {
  try {
    const sb = serviceClient();
    if (!sb) return;
    const message = String(input.message ?? "").slice(0, 4000);
    await sb.from("error_log").insert({
      user_id: input.userId ?? null,
      user_email: input.userEmail ?? null,
      category: input.category ?? inferCategory(message),
      section: input.section ?? null,
      message,
      status_code: input.statusCode ?? null,
      path: input.path ?? null,
      severity: input.severity ?? "error",
      meta: input.meta ?? null,
    });
  } catch {
    /* never let logging break the request */
  }
}
