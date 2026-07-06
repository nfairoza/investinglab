-- Per-user rate-limit windows (P2). Best-effort shared store so limits hold
-- across serverless instances; the hot path uses in-memory first. Service-role
-- only (RLS on, no policies).

create table if not exists rate_limits (
  key        text primary key,   -- "<bucket>:<userId>"
  hits       jsonb not null default '[]'::jsonb,  -- array of epoch-ms timestamps
  updated_at timestamptz not null default now()
);

alter table rate_limits enable row level security;
revoke all on rate_limits from anon, authenticated;
