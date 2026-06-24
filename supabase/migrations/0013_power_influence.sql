-- =============================================================================
-- Power Trades — Phase 4: Influence Context (FEC + OpenSecrets).
--
-- CRITICAL: campaign finance + lobbying are NOT trades. This table is SEPARATE
-- from power_trade_records and is never rendered in the Alpha Feed or styled as
-- buy/sell. It captures who funds whom / who lobbies on what, as CONTEXT.
--
-- Service-role only (RLS enabled, NO policies) — same model as the other Power
-- Trades tables. Written by server sync via SUPABASE_SECRET_KEY.
--
-- Privacy / licensing baked into how we populate this (enforced in the adapter,
-- not the schema): NO individual street addresses (FEC), OpenSecrets data must
-- be attributed (CC BY-NC-SA), both carry non-commercial restrictions.
-- =============================================================================

create table if not exists power_influence_records (
  id uuid primary key default gen_random_uuid(),
  source text not null,                       -- 'fec' | 'opensecrets'
  record_type text not null,                  -- campaign_contribution | committee_summary | lobbying | pac | revolving_door
  source_url text not null,                   -- REQUIRED link to the FEC/OpenSecrets record
  provider_record_id text,
  dedupe_key text not null,
  person_id uuid references power_people(id) on delete set null,
  subject_name text not null,                 -- candidate / committee / org / firm
  counterparty_name text,                     -- donor org / client / registrant (NO individual addresses)
  city text,
  state text,
  employer text,
  occupation text,
  amount numeric,
  amount_label text,
  cycle_or_year text,
  period_start date,
  period_end date,
  issue_or_industry text,
  attribution text,                           -- e.g. 'Source: OpenSecrets' for CC BY-NC-SA
  parser_version text,
  fetched_at timestamptz not null default now()
);
create unique index if not exists idx_power_influence_dedupe on power_influence_records(dedupe_key);
create index if not exists idx_power_influence_source on power_influence_records(source);
create index if not exists idx_power_influence_type on power_influence_records(record_type);
create index if not exists idx_power_influence_person on power_influence_records(person_id);

alter table power_influence_records enable row level security;
-- Intentionally no policies: only the service role may access.
