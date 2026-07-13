-- Alert Delivery: layered notifications (ALERTDEL). One row per delivered alert
-- trigger, carrying the read-tracking + escalation state that lets an unseen push
-- fall back to a batched email. The in-app feed (notifications table) remains the
-- unconditional permanent record; this table is the delivery ledger.
--
-- Deploy: apply after 0034. No new env vars beyond the existing RESEND_API_KEY /
-- DIGEST_FROM (already documented for the F2 digest) and the WEB_PUSH_* VAPID keys.

-- Severity on the alert itself: users can mark an alert "critical" (severity 3 →
-- push AND email immediately). Routine alerts default to severity 1.
alter table alerts add column if not exists critical boolean not null default false;

create table if not exists alert_deliveries (
  id            uuid primary key default gen_random_uuid(),
  alert_id      uuid,                         -- null for non-alert deliveries (e.g. Insights)
  user_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  severity      smallint not null default 1,  -- 1 = routine (push only), 3 = critical (push + email now)
  triggered_at  timestamptz not null default now(),
  push_sent_at  timestamptz,                  -- when the web push was dispatched (null = not sent)
  push_seen_at  timestamptz,                  -- when the user opened the notification / feed (null = unseen)
  email_sent_at timestamptz,                  -- when an email went out (immediate for sev3, escalation for sev1)
  -- Send outcomes for /admin debuggability: { push: "ok"|"no_subs"|"fail:...", email: "ok"|"skip"|"fail:..." }
  outcomes      jsonb not null default '{}'::jsonb,
  payload       jsonb not null default '{}'::jsonb,  -- title/body/url snapshot
  created_at    timestamptz not null default now()
);

alter table alert_deliveries enable row level security;

-- Per-user policies (service role bypasses RLS for the cron + trigger path).
create policy "ad select own" on alert_deliveries for select using (auth.uid() = user_id);
create policy "ad insert own" on alert_deliveries for insert with check (auth.uid() = user_id);
create policy "ad update own" on alert_deliveries for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ad delete own" on alert_deliveries for delete using (auth.uid() = user_id);

-- The escalation job scans for stale-unseen sev-1 deliveries; index the hot path.
create index if not exists idx_alert_deliveries_escalate
  on alert_deliveries (severity, push_sent_at)
  where push_seen_at is null and email_sent_at is null;
create index if not exists idx_alert_deliveries_user on alert_deliveries (user_id, triggered_at desc);
