-- Persist Plaid's merchant logo_url on each transaction so rows can show the
-- merchant's real logo (with the category icon as a graceful fallback). Plaid
-- returns this on the transaction object; we were dropping it. Nullable; the
-- next incremental sync backfills it as transactions re-appear, and a one-time
-- resync (disconnect/reconnect or the sync cursor advancing) fills history.
alter table plaid_transactions add column if not exists logo_url text;
