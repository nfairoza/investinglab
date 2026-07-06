-- App-wide encrypted secrets (P1.1). Platform connector/AI keys entered in the
-- UI persist here (AES-256-GCM ciphertext), so they survive serverless cold
-- starts instead of living only in process memory.
--
-- Security: NO client access at all. Only the service-role server client (which
-- bypasses RLS) reads/writes this table. RLS is enabled with zero policies, so
-- the anon/auth keys can never touch it.

create table if not exists app_secrets (
  field       text primary key,
  ciphertext  text not null,
  iv          text not null,
  updated_at  timestamptz not null default now()
);

alter table app_secrets enable row level security;
-- Intentionally no policies: only the service role (RLS-exempt) may access it.

revoke all on app_secrets from anon, authenticated;
