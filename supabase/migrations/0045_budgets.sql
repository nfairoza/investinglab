-- =============================================================================
-- H1 — Budgets. Evolution of MV2 category_targets into a first-class Budgets
-- system. v1 is PERSONAL scope only; the `scope`/`owner_id` columns are the
-- forward-compat seam for H4 household budgets (never written until Household
-- ships). Derived numbers stay in deterministic code — no AI writes here.
--
-- Deploy: apply after 0044. No new env vars. Existing MV2 targets are migrated
-- 1:1 below, so a user's targets appear as budgets immediately. category_targets
-- is intentionally NOT dropped (reads move to budgets; a later migration cleans
-- it up once nothing references it).
-- =============================================================================

create table if not exists budgets (
  id             uuid primary key default gen_random_uuid(),
  -- 'personal' → owner_id is a user id; 'household' → owner_id is a household id
  -- (H4, unused in v1). RLS below only covers personal rows.
  scope          text not null default 'personal' check (scope in ('personal','household')),
  owner_id       uuid not null default auth.uid(),
  category       text not null,
  monthly_amount numeric not null,
  suggested_from numeric,            -- the p50 the suggestion was based on (evidence)
  status         text not null default 'active' check (status in ('active','archived')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- One ACTIVE budget per (owner, category). Archived rows don't collide, so a
-- category can be re-budgeted after archiving the old one.
create unique index if not exists idx_budgets_active_owner_category
  on budgets (owner_id, category) where status = 'active';
create index if not exists idx_budgets_owner_active on budgets (owner_id) where status = 'active';

alter table budgets enable row level security;
-- Personal-scope RLS (the only scope v1 writes). Household policies are added
-- with the Household feature (H2) — until then no household rows exist.
create policy "budgets select own personal" on budgets for select
  using (scope = 'personal' and auth.uid() = owner_id);
create policy "budgets insert own personal" on budgets for insert
  with check (scope = 'personal' and auth.uid() = owner_id);
create policy "budgets update own personal" on budgets for update
  using (scope = 'personal' and auth.uid() = owner_id)
  with check (scope = 'personal' and auth.uid() = owner_id);
create policy "budgets delete own personal" on budgets for delete
  using (scope = 'personal' and auth.uid() = owner_id);

-- 1:1 migration of existing MV2 targets → personal budgets. Idempotent: the
-- partial unique index + NOT EXISTS guard mean re-running won't duplicate.
insert into budgets (scope, owner_id, category, monthly_amount, suggested_from, status, created_at)
select 'personal', t.user_id, t.category, t.monthly_target, t.suggested_from, 'active', t.created_at
from category_targets t
where not exists (
  select 1 from budgets b
  where b.owner_id = t.user_id and b.category = t.category and b.status = 'active'
);
