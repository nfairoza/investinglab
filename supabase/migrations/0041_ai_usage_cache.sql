-- AIOPT A2 — cached-input-token accounting. Anthropic prompt caching bills cache
-- reads at ~10% of base input; we log the cache-read token count per call so the
-- admin cost dashboard can show cache hit-rate per feature. Nullable (absent =
-- the call used no caching). No backfill needed.
alter table ai_usage add column if not exists cached_input_tokens integer;
