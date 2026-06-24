-- =============================================================================
-- Screener preset rankings — a single SHARED row holding the AI-chosen order of
-- preset keys for the day. Not per-user: one AI call ranks presets for everyone,
-- refreshed each morning (~8am ET) and cached the rest of the day. Admin can
-- force a re-rank. Service-role only (RLS enabled, no policies); the server reads
-- /writes via SUPABASE_SECRET_KEY. Users only ever see the resulting order via
-- the API — never the rationale.
-- =============================================================================

create table if not exists screener_preset_rankings (
  id text primary key default 'global',       -- always the single 'global' row
  ranked_keys text[] not null default '{}',   -- ordered preset keys, best first
  rationale text,                             -- admin-only: why these today
  market_note text,                           -- admin-only: market summary used
  generated_at timestamptz not null default now(),
  generated_by uuid
);

alter table screener_preset_rankings enable row level security;
-- Intentionally no policies: only the service role may access.
