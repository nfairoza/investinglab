-- AIEFF4: per-feature AI cost attribution. Adds a `feature` label to ai_usage so
-- the admin cost dashboard can group spend by product surface (chat, research,
-- enrich, advisor, insights-narration, congress-alpha, watchlist-recs, predict,
-- doctor, opportunities, strategy, money-analysis, alerts-suggest) — mirroring the
-- /connectors per-feature FMP strip. Before this, usage was only distinguishable
-- by the router's coarse `task` bucket, so a token leak in one feature was
-- invisible inside a shared total.
--
-- Backfill: existing rows get their `feature` derived from `task` as a best-effort
-- label (older rows never carried the originating surface). New rows always set it.

alter table ai_usage add column if not exists feature text;

-- Best-effort backfill for historical rows so the dashboard isn't half-blank.
update ai_usage set feature = coalesce(feature, task) where feature is null;

create index if not exists ai_usage_feature_idx on ai_usage (feature);
