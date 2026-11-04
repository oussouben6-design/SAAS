-- =====================================================================
-- 0012 — Autorisation du basculement vers le rôle applicatif
--
-- L'application exécute `set local role organix_app` dans chaque transaction métier afin que
-- les politiques RLS s'appliquent réellement (le rôle de connexion, lui, contourne la RLS pour
-- les migrations et le service d'authentification).
--
-- PostgreSQL 16 a dissocié ADMIN / INHERIT / SET : créer un rôle ne suffit plus, il faut
-- explicitement autoriser le rôle de connexion à l'endosser. Sans cela, Supabase (PG 16/17)
-- renvoie : `42501: permission denied to set role "organix_app"`.
--
-- Migration volontairement défensive : idempotente, compatible PostgreSQL 15 (pas d'option
-- `set true`) et PGlite, et sans effet si le rôle de connexion n'a pas le droit de déléguer.
-- =====================================================================

do $$
declare
  connecting_role text := current_user;
  server_version integer := current_setting('server_version_num')::integer;
begin
  if connecting_role = 'organix_app' then
    return; -- déjà connecté avec le rôle applicatif : rien à autoriser.
  end if;

  begin
    if server_version >= 160000 then
      execute format(
        'grant organix_app to %I with inherit true, set true',
        connecting_role
      );
    else
      execute format('grant organix_app to %I', connecting_role);
    end if;
    raise notice 'organix_app peut désormais être endossé par %', connecting_role;
  exception
    when insufficient_privilege then
      raise warning
        'Droit insuffisant pour autoriser % à endosser organix_app : exécutez la migration avec le rôle propriétaire (postgres).',
        connecting_role;
  end;
end
$$;

-- Vérification exploitable par `npm run db:status` et les tests.
create or replace function app.can_set_app_role() returns boolean
language sql stable as $$
  select pg_has_role(current_user, 'organix_app', 'USAGE')
      or current_user = 'organix_app';
$$;

comment on function app.can_set_app_role() is
  'Vrai si le rôle de connexion courant peut endosser organix_app (requis par l''application).';
