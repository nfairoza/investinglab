-- AI usage log (P6.3). One row per AI call for cost tracking: task, provider,
-- model, token counts, latency, and (best-effort) the user. Service-role only —
-- RLS on with no policies; the admin cost dashboard reads via the service key
-- and enforces admin at the API layer (same pattern as error_log).

create table if not exists ai_usage (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  task          text,
  provider      text,          -- "claude" | "gemini"
  model         text,
  input_tokens  integer,
  output_tokens integer,
  latency_ms    integer,
  ok            boolean not null default true,
  user_id       uuid,
  estimated     boolean not null default false  -- true when token counts are approximate
);

create index if not exists ai_usage_created_at_idx on ai_usage (created_at desc);

alter table ai_usage enable row level security;
revoke all on ai_usage from anon, authenticated;
