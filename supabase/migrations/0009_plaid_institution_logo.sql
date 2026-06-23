-- Store the institution's logo (base64 PNG) + brand color so the UI can show
-- the bank/brokerage logo alongside its name. Best-effort; nullable.
alter table plaid_items add column if not exists institution_logo text;
alter table plaid_items add column if not exists institution_color text;
