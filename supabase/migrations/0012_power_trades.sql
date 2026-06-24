-- =============================================================================
-- Power Trades Tracker — Phase 1 (congressional via the existing FMP source).
--
-- Ingestion runs as server-side sync jobs that write RAW provider payloads +
-- NORMALIZED trade rows into these tables. The UI reads ONLY the local tables
-- (never fetches a provider on render). Quiver / SEC Form 4 / Executive / FEC /
-- OpenSecrets are future phases — their adapters are stubbed and disabled.
--
-- This is shared, public-disclosure market data (not per-user), so the tables
-- are service-role only: RLS enabled with NO policies. The server writes via
-- SUPABASE_SECRET_KEY (bypasses RLS); admin/read APIs verify isAdmin in code or
-- read via the service role.
-- =============================================================================

-- Source registry: one row per provider/source with status + last sync.
create table if not exists power_sources (
  source text primary key,                 -- 'fmp_congress' | 'quiver' | 'sec_form_4' | ...
  label text not null,
  enabled boolean not null default false,
  last_sync_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

-- Canonical people directory (politicians, insiders, etc.).
create table if not exists power_people (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  category text not null default 'other',  -- congress | executive | corporate_insider | lobbyist | donor | advisor | family_member | celebrity | other
  party text,
  state text,
  office text,
  roles text[] not null default '{}',
  identifiers jsonb not null default '{}',  -- { bioguideId, fmpSenateId, secCik, fecCandidateId, ... }
  source_coverage text[] not null default '{}',
  latest_disclosure_date date,
  trade_count_30d int not null default 0,
  trade_count_90d int not null default 0,
  trade_count_1y int not null default 0,
  trade_count_all int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_power_people_canon on power_people(lower(canonical_name));
create index if not exists idx_power_people_category on power_people(category);

-- Alias → canonical person mapping (Pelosi / Paul Pelosi / Rep. Nancy Pelosi).
create table if not exists power_person_aliases (
  alias text primary key,                   -- stored lowercased
  person_id uuid references power_people(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Normalized parsed trades — THE table the UI reads for the Alpha/Raw feeds.
create table if not exists power_trade_records (
  id uuid primary key default gen_random_uuid(),
  source text not null,                      -- PowerTradeSource
  source_url text,
  provider_record_id text,                   -- dedupe + raw linkage
  dedupe_key text not null,                  -- stable hash for idempotent upserts
  person_id uuid references power_people(id) on delete set null,
  person_name text not null,
  person_role text,
  related_person_name text,
  relationship text,                         -- self | spouse | dependent | trust | family_disclosed | unknown
  entity_name text,
  ticker text,
  asset_name text,
  transaction_type text,                     -- buy | sell | exchange | option | gift | income | holding | unknown
  transaction_date date,
  disclosure_date date,
  amount_min numeric,
  amount_max numeric,
  amount_label text,
  filing_type text,
  chamber_or_branch text,                    -- house | senate | executive | corporate | other
  confidence_score int,
  tags text[] not null default '{}',
  parser_version text,
  normalized_at timestamptz not null default now()
);
create unique index if not exists idx_power_trades_dedupe on power_trade_records(dedupe_key);
create index if not exists idx_power_trades_source on power_trade_records(source);
create index if not exists idx_power_trades_person on power_trade_records(person_id);
create index if not exists idx_power_trades_ticker on power_trade_records(ticker);
create index if not exists idx_power_trades_disc on power_trade_records(disclosure_date desc);

-- Raw provider payloads (debugging + parsing-status display).
create table if not exists power_disclosures_raw (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  provider_record_id text,
  person_name text,
  payload jsonb not null,
  parse_status text not null default 'parsed', -- parsed | partial | failed | no_trade_rows
  parse_note text,
  fetched_at timestamptz not null default now()
);
create index if not exists idx_power_raw_source on power_disclosures_raw(source);
create index if not exists idx_power_raw_status on power_disclosures_raw(parse_status);

-- One row per sync run for diagnostics.
create table if not exists power_source_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  rows_ingested int not null default 0,
  rows_normalized int not null default 0,
  errors int not null default 0,
  note text
);
create index if not exists idx_power_runs_source on power_source_sync_runs(source, started_at desc);

-- All Power Trades tables are service-role only.
alter table power_sources          enable row level security;
alter table power_people           enable row level security;
alter table power_person_aliases   enable row level security;
alter table power_trade_records    enable row level security;
alter table power_disclosures_raw  enable row level security;
alter table power_source_sync_runs enable row level security;
-- Intentionally no policies on any of the above: only the service role may access.
