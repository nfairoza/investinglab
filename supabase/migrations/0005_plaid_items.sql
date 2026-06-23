-- =============================================================================
-- Plaid bank connections — per user, RLS-protected.
--
-- One row per linked institution ("Item" in Plaid terms). Holds the long-lived
-- access_token (server-only; never sent to the browser) plus cached account
-- metadata. RLS scopes every row to its owner, exactly like broker_connections.
-- =============================================================================

create table if not exists plaid_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  item_id text not null,                 -- Plaid item id (unique per user+institution)
  access_token text not null,            -- Plaid access token (SECRET — server only)
  institution_name text,
  institution_id text,
  accounts jsonb not null default '[]',  -- cached [{account_id,name,mask,type,subtype}]
  cursor text,                           -- transactions sync cursor (incremental)
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, item_id)
);

alter table plaid_items enable row level security;
alter table plaid_items force row level security;

create policy "pi select own" on plaid_items for select using (auth.uid() = user_id);
create policy "pi insert own" on plaid_items for insert with check (auth.uid() = user_id);
create policy "pi update own" on plaid_items for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "pi delete own" on plaid_items for delete using (auth.uid() = user_id);

create index if not exists idx_plaid_items_user on plaid_items(user_id);
