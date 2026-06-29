-- Time-bound alerts: an optional expiry timestamp. When set and in the past,
-- the alert is considered expired and is pruned on the next read (server) and
-- hidden immediately (client). NULL = persistent alert (the existing behavior).
alter table alerts add column if not exists expires_at timestamptz;
create index if not exists idx_alerts_expires_at on alerts(expires_at) where expires_at is not null;
