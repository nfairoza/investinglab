-- =============================================================================
-- Power Trades V2 · PT4 — Committee jurisdiction flags.
--
-- Per congressional trade: whether the traded ticker's sector falls within a
-- committee the member sits on (a potential informational edge — context, not
-- an accusation). Computed nightly by `pt-committee-flags` from the live
-- @unitedstates committee roster + the ticker's sector. Derived + rebuildable.
--
-- Shared public-disclosure data: service-role only (RLS on, no policies).
--
-- Deploy: apply after 0037. No new env vars.
-- =============================================================================

create table if not exists power_trade_flags (
  trade_id          uuid primary key references power_trade_records(id) on delete cascade,
  committee_overlap boolean not null default false,
  overlap_level     text,           -- 'primary' | 'secondary' | 'none'
  committee         text,           -- the committee creating the overlap
  sector            text,           -- the bucketed sector of the traded ticker
  computed_at       timestamptz not null default now()
);

alter table power_trade_flags enable row level security;

-- Partial index: the "committee-overlap trades only" filter reads just the true rows.
create index if not exists idx_power_trade_flags_overlap on power_trade_flags (committee_overlap) where committee_overlap;
