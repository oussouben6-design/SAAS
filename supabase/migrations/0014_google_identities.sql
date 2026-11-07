-- =====================================================================
-- 0014 — Connexion avec Google (OAuth 2.0 / OpenID Connect)
-- L'identité externe est stockée séparément du profil : un compte peut
-- exister sans mot de passe (aucune ligne dans user_credentials) et la
-- liaison se fait sur l'identifiant stable du fournisseur (`sub`),
-- jamais sur la seule adresse e-mail après la première liaison.
-- =====================================================================

create table if not exists user_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  provider text not null check (provider in ('google')),
  provider_subject text not null,
  provider_email text,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz,
  unique (provider, provider_subject),
  unique (user_id, provider)
);

create index if not exists user_identities_user_idx on user_identities (user_id);

alter table user_identities enable row level security;
alter table user_identities force row level security;

-- Lecture de sa propre liaison uniquement ; toute écriture passe par le
-- service d'authentification (rôle élevé), jamais par le rôle applicatif.
drop policy if exists user_identities_select_self on user_identities;
create policy user_identities_select_self on user_identities for select
  using (user_id = app.current_user_id());
