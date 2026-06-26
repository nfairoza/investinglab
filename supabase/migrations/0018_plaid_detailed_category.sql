-- Store Plaid's DETAILED personal-finance category (e.g.
-- FOOD_AND_DRINK_GROCERIES) alongside the coarse primary, so the app-side
-- categorizer (lib/money/categorize.ts) can map merchants more precisely.
-- Nullable: rows synced before this column simply fall back to merchant + primary.
alter table plaid_transactions add column if not exists plaid_detailed text;
