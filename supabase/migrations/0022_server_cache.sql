-- Durable server cache (P1.3). Server-computed artifacts (research memos,
-- rankings, quote batches) survive serverless cold starts instead of living only
-- in per-instance memory. lib/daily-cache.ts's 8am-ET staleness stays the
-- freshness check on read; an in-memory layer remains the hot L1.
--
-- Not user-scoped (shared/app-wide values). Service-role only; RLS on, no policies.

create table if not exists server_cache (
  key          text primary key,
  value        jsonb not null,
  generated_at timestamptz not null default now()
);

alter table server_cache enable row level security;
-- No policies: only the service role (RLS-exempt) may read/write.
revoke all on server_cache from anon, authenticated;
