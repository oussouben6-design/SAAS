-- =====================================================================
-- 0020 — Réparation : fuite inter-organisations par PostgREST + durcissement rétabli
--
-- Deux dérives constatées sur le projet Supabase `opnlvqwbevnivfjpbrxa` le 7 novembre 2026 :
--
-- 1. `0019` avait créé les politiques `invoice_items_insert` et `quote_items_insert` en
--    `for all` **sans clause USING**. Une politique permissive `FOR ALL` sert aussi aux
--    SELECT, avec USING implicite `true` : elle est donc OR-ée avec `*_select` et rend
--    **toutes les lignes de toutes les organisations** lisibles dès que le rôle a le
--    privilège SELECT sur la table.
-- 2. `0013` (révocation des privilèges Supabase) avait été annulée : `authenticated` avait
--    SELECT/INSERT/UPDATE/DELETE sur 43 des 49 tables métier, et `execute` sur les fonctions
--    `app.*`. Les deux ensemble = donnée financière inter-locataires exposée via
--    `GET /rest/v1/invoice_items?select=*`.
--
-- Correction : les politiques redeviennent `for insert` (leur nom et leur intention), et les
-- révocations de 0013 sont rejouées. Sans les rôles `anon`/`authenticated` (PGlite), seule la
-- partie politiques s'applique.
-- =====================================================================

-- ---------------------------------------------------------------- 1. Politiques d'insertion

drop policy if exists invoice_items_insert on invoice_items;
create policy invoice_items_insert on invoice_items for insert
  with check (
    exists (
      select 1 from invoices i
      where i.id = invoice_items.invoice_id
        and app.has_permission(i.organization_id, 'finance', 'create')
    )
  );

drop policy if exists quote_items_insert on quote_items;
create policy quote_items_insert on quote_items for insert
  with check (
    exists (
      select 1 from quotes q
      where q.id = quote_items.quote_id
        and app.has_permission(q.organization_id, 'crm', 'create')
    )
  );

-- ---------------------------------------------------------------- 2. Durcissement Supabase

do $harden$
declare
  exposed text[] := array['anon', 'authenticated'];
  role_name text;
begin
  foreach role_name in array exposed loop
    if not exists (select 1 from pg_roles where rolname = role_name) then
      continue; -- base non Supabase : rien à durcir.
    end if;

    execute format('revoke all on schema app from %I', role_name);
    execute format('revoke all on all functions in schema app from %I', role_name);
    execute format('revoke all on all tables in schema app from %I', role_name);
    execute format('revoke all on all tables in schema public from %I', role_name);
    execute format('revoke all on all sequences in schema public from %I', role_name);

    execute format('alter default privileges in schema public revoke all on tables from %I', role_name);
    execute format('alter default privileges in schema public revoke all on sequences from %I', role_name);
    execute format('alter default privileges in schema app revoke all on functions from %I', role_name);

    raise notice 'Privilèges révoqués à nouveau pour le rôle Supabase %', role_name;
  end loop;

  -- Les fonctions de déclencheur n'ont rien à faire entre les mains d'un appelant HTTP.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'handle_new_user') then
    execute 'revoke execute on function public.handle_new_user() from public';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
    execute 'revoke execute on function public.rls_auto_enable() from anon, authenticated';
  end if;
end
$harden$;

-- ---------------------------------------------------------------- 3. Privilèges des tables futures
-- Les grants au rôle applicatif sont accordés migration par migration
-- (`grant ... on all tables in schema public to organix_app`) : une table créée plus tard
-- n'hérite donc d'aucun droit et devient silencieusement inutilisable par `organix_app`
-- (c'est le cas de `user_mfa`, `mfa_challenges` et `user_identities`, que seule la voie
-- privilégiée du service d'authentification lit — choix assumé, pas un accident).
-- Les privilèges par défaut ci-dessous couvrent les créations de tables ultérieures ; ils ne
-- modifient rien pour les tables existantes.

do $app$
begin
  if exists (select 1 from pg_roles where rolname = 'organix_app') then
    execute 'alter default privileges in schema public grant select, insert, update, delete on tables to organix_app';
    execute 'alter default privileges in schema public grant usage, select on sequences to organix_app';
    execute 'alter default privileges in schema app grant execute on functions to organix_app';
    raise notice 'Privilèges par défaut configurés : les prochaines tables seront accessibles à organix_app';
  end if;
end
$app$;
