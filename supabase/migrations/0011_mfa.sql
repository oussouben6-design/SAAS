-- =====================================================================
-- 0011 — Double authentification (TOTP, RFC 6238)
-- Le secret est chiffré en AES-256-GCM côté application (clé MFA_ENCRYPTION_KEY) :
-- la base ne contient jamais de secret exploitable seule.
-- =====================================================================

create table if not exists user_mfa (
  user_id uuid primary key references profiles (id) on delete cascade,
  secret_cipher text not null,
  secret_iv text not null,
  secret_tag text not null,
  confirmed_at timestamptz,
  last_used_at timestamptz,
  recovery_codes text[] not null default '{}',
  failed_attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Jetons de défi : la connexion par mot de passe seule ne crée plus de session
-- lorsque la double authentification est active.
create table if not exists mfa_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  attempts integer not null default 0,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists mfa_challenges_user_idx on mfa_challenges (user_id, expires_at desc);

alter table user_mfa enable row level security;
alter table user_mfa force row level security;
alter table mfa_challenges enable row level security;
alter table mfa_challenges force row level security;

-- Lecture de son propre état uniquement ; toute écriture passe par le service
-- d'authentification (rôle élevé), jamais par le client.
drop policy if exists user_mfa_select_self on user_mfa;
create policy user_mfa_select_self on user_mfa for select
  using (user_id = app.current_user_id());

drop policy if exists mfa_challenges_select_self on mfa_challenges;
create policy mfa_challenges_select_self on mfa_challenges for select
  using (user_id = app.current_user_id());
