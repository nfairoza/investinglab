-- =============================================================================
-- BILL B0/B1 — Stripe subscriptions + card-free trial + admin master switch.
--
-- The webhook is the ONLY writer of `subscriptions` (idempotent upserts on the
-- Stripe subscription id). Users read their own row; only the service role writes.
-- Trials are tracked in OUR table (no Stripe customer until conversion), so a new
-- signup gets a trial with no card collected.
-- =============================================================================

create table if not exists subscriptions (
  user_id                uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  plan                   text not null default 'trial',   -- 'trial' | 'free' | 'premium' | 'pro'
  status                 text,                             -- Stripe subscription status (active, past_due, canceled, trialing, …)
  stripe_customer_id     text,
  stripe_subscription_id text,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  trial_started_at       timestamptz,                     -- our trial clock (card-free)
  trial_days             integer not null default 30,
  updated_at             timestamptz not null default now(),
  created_at             timestamptz not null default now()
);
alter table subscriptions enable row level security;
-- Users may READ their own subscription; only the service role writes (webhook).
create policy "subscriptions select own" on subscriptions for select using (auth.uid() = user_id);

-- Idempotency ledger for webhook events — a replayed Stripe event is a no-op.
create table if not exists billing_events (
  event_id    text primary key,
  event_type  text,
  received_at timestamptz not null default now()
);
alter table billing_events enable row level security;
-- No policies: service-role only.

-- App-wide config (non-encrypted, service-role only) — holds the billing master
-- switch. Separate from app_secrets (which is ciphertext-only).
create table if not exists app_config (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);
alter table app_config enable row level security;
revoke all on app_config from anon, authenticated;
-- No policies: only the service role (RLS-exempt) reads/writes.
