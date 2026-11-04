-- =====================================================================
-- 0013 — Durcissement spécifique à Supabase
--
-- Supabase expose automatiquement le schéma `public` via PostgREST aux rôles `anon` et
-- `authenticated` (et accorde des privilèges par défaut aux futures tables). ORGANIX n'utilise
-- pas PostgREST : son API passe exclusivement par le serveur Next.js avec le rôle `organix_app`.
-- On retire donc ces privilèges pour qu'aucune donnée ne soit joignable avec la seule clé `anon`.
--
-- La migration est sans effet hors Supabase (rôles absents), et ré-exécutable sans risque.
-- =====================================================================

do $$
declare
  exposed text[] := array['anon', 'authenticated'];
  role_name text;
begin
  foreach role_name in array exposed loop
    if not exists (select 1 from pg_roles where rolname = role_name) then
      continue; -- base non Supabase : rien à durcir.
    end if;

    -- Aucun accès au schéma applicatif (fonctions internes : contexte, permissions).
    execute format('revoke all on schema app from %I', role_name);
    execute format('revoke all on all functions in schema app from %I', role_name);
    execute format('revoke all on all tables in schema app from %I', role_name);

    -- Aucun accès aux tables métier via l'API générée automatiquement.
    execute format('revoke all on all tables in schema public from %I', role_name);
    execute format('revoke all on all sequences in schema public from %I', role_name);

    -- Et pour les tables créées plus tard par de futures migrations.
    execute format('alter default privileges in schema public revoke all on tables from %I', role_name);
    execute format('alter default privileges in schema public revoke all on sequences from %I', role_name);
    execute format('alter default privileges in schema app revoke all on functions from %I', role_name);

    raise notice 'Privilèges révoqués pour le rôle Supabase %', role_name;
  end loop;
end
$$;
