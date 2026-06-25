-- =============================================================================
-- Shared AI research-memo cache.
--
-- A research memo depends only on PUBLIC market data for a ticker (the input is
-- just the symbol), so it's identical for every user and can be cached once and
-- reused by everyone — cutting AI token spend dramatically. The first viewer
-- after the cache goes stale regenerates it; everyone else reads the cache.
--
-- Freshness: reused until it predates the most recent 8am ET boundary (so it
-- refreshes each morning) OR is older than 12h, whichever comes first. Admins
-- can force a fresh memo anytime.
--
-- Not user-scoped: any authenticated user may READ; only the server (and, in the
-- app, admins) writes via force-refresh, but writes are allowed for any authed
-- user so the lazy first-viewer regeneration works. No personal data — public
-- market analysis keyed by symbol.
-- =============================================================================

create table if not exists shared_research (
  symbol text primary key,
  payload jsonb not null,              -- the full /api/research DataResult body
  model text,
  generated_at timestamptz not null default now(),
  generated_by uuid references auth.users(id) on delete set null
);

alter table shared_research enable row level security;

create policy "sr select all authed" on shared_research
  for select using (auth.role() = 'authenticated');
create policy "sr insert authed" on shared_research
  for insert with check (auth.role() = 'authenticated');
create policy "sr update authed" on shared_research
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create index if not exists idx_shared_research_generated_at on shared_research(generated_at);
