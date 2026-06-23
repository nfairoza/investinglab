-- =============================================================================
-- Shared AI prediction cache.
--
-- General single-ticker / mini predictions depend ONLY on public market data
-- (the request is just a ticker symbol — no account, holdings, or user input).
-- So the result is identical for every user and can be cached once and reused by
-- everyone, cutting AI token spend. Entries are reused for up to 2 hours, then
-- the next viewer regenerates them (or any user can force a refresh).
--
-- This table is intentionally NOT user-scoped: every authenticated user may read
-- it, and any authenticated user may write/refresh it. It contains no personal
-- data — only public-market predictions keyed by symbol.
-- =============================================================================

create table if not exists shared_predictions (
  symbol text primary key,
  payload jsonb not null,              -- the full /api/predict response body
  model text,
  generated_at timestamptz not null default now(),
  generated_by uuid references auth.users(id) on delete set null
);

alter table shared_predictions enable row level security;

-- Any logged-in user can read the shared cache.
create policy "sp select all authed" on shared_predictions
  for select using (auth.role() = 'authenticated');

-- Any logged-in user can populate the cache on a miss …
create policy "sp insert authed" on shared_predictions
  for insert with check (auth.role() = 'authenticated');

-- … and any logged-in user can refresh an existing entry.
create policy "sp update authed" on shared_predictions
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create index if not exists idx_shared_predictions_generated_at on shared_predictions(generated_at);
