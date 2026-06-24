-- =============================================================================
-- Error log — app-wide capture of user-facing errors for the Admin Portal.
--
-- Every time a user hits an error (an AI provider failure, an FMP quota/limit,
-- a Plaid issue, or any other handled failure) we append a row here. Admins
-- review them in the Admin Portal → Errors table; regular users never see this
-- data and only get a generic "contact your administrator" message.
--
-- Service-role only: RLS is enabled with NO policies, so the anon/auth key
-- cannot read or write it. The server writes via SUPABASE_SECRET_KEY (which
-- bypasses RLS) and the admin API reads the same way after verifying the
-- caller is an admin in application code.
-- =============================================================================

create table if not exists error_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_email text,                       -- denormalized for easy admin display
  category text not null default 'other', -- 'ai' | 'market_data' | 'plaid' | 'auth' | 'app' | 'other'
  section text,                          -- which feature/route, e.g. 'predict', 'advisor', 'research'
  message text not null,                 -- the raw error text (admins only)
  status_code int,                       -- HTTP status if applicable
  path text,                             -- request path / page
  severity text not null default 'error', -- 'error' | 'warning' | 'info'
  meta jsonb,                            -- any extra structured context
  created_at timestamptz not null default now()
);

alter table error_log enable row level security;
-- Intentionally no policies: only the service role (bypasses RLS) may access it.

create index if not exists idx_error_log_created on error_log(created_at desc);
create index if not exists idx_error_log_category on error_log(category);
create index if not exists idx_error_log_user on error_log(user_id);
