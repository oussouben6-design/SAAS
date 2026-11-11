-- =====================================================================
-- 0024 — Code de vérification par e-mail à chaque connexion (OTP)
--
-- Après vérification des identifiants (et de la 2FA le cas échéant), aucune
-- session n'est créée tant que le code à 6 chiffres envoyé par e-mail à
-- l'adresse du compte n'a pas été saisi. Le code n'est jamais stocké en
-- clair : uniquement une empreinte scrypt (algorithm$salt$hash), comme les
-- codes de secours de la 2FA — une fuite de la base ne permet pas de
-- rejouer un code. Défi à usage unique, 10 minutes de validité, 5 essais.
-- =====================================================================

create table if not exists login_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  -- Jeton opaque remis au navigateur pour désigner le défi en cours.
  token_hash text not null unique,
  -- Empreinte scrypt du code à 6 chiffres (jamais le code lui-même).
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  attempts integer not null default 0,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists login_challenges_user_idx on login_challenges (user_id, expires_at desc);

alter table login_challenges enable row level security;
alter table login_challenges force row level security;

-- Lecture de son propre défi uniquement ; toute écriture passe par le
-- service d'authentification (rôle élevé), jamais par le rôle applicatif.
drop policy if exists login_challenges_select_self on login_challenges;
create policy login_challenges_select_self on login_challenges for select
  using (user_id = app.current_user_id());

grant select, insert, update, delete on all tables in schema public to organix_app;
