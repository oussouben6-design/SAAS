-- =====================================================================
-- 0026 — Rendre le modèle RPC réellement exécutable et réparer les politiques « devis »
--
-- Trois écarts mesurés sur le projet Supabase `opnlvqwbevnivfjpbrxa` le 12 novembre 2026,
-- après vérification de l'état réel (`pg_proc`, `has_schema_privilege`, `pg_policies`) :
--
-- 1. `authenticated` n'a PAS `USAGE` sur le schéma `app` — `0013` puis `0020` le révoquent,
--    et rien ne l'a rétabli. Or les politiques RLS appellent `app.current_user_id()`,
--    `app.has_permission(...)`, `app.is_member(...)` : PostgreSQL vérifie le droit d'usage du
--    schéma AVANT d'exécuter la fonction. Mesure : `set local role authenticated;
--    select app.current_user_id()` → `42501: permission denied for schema app`. Le contexte
--    JWT de `0022` était donc juste mais **inatteignable** : le défaut réparé par `0022` se
--    rejouait un cran plus haut, sur toute voie PostgREST / Realtime / RPC.
--
-- 2. `public.rls_auto_enable()` reste exécutable par `anon` et `authenticated` : `0020` et
--    `0023` révoquent l'exécution aux rôles **nommés**, mais le privilège venait de PUBLIC
--    (`proacl` = `{=X/postgres,postgres=X/postgres,service_role=X/postgres}`). Révoquer un
--    rôle nommé ne retire pas le droit hérité de PUBLIC : les deux migrations semblaient
--    appliquées et ne changeaient rien. C'est la cause racine, traitée ici pour toutes les
--    fonctions du dépôt.
--
-- 3. `quotes` et `quote_items` sont soumises au module `crm` en base alors que l'application
--    exige `finance` (`requirePagePermission("finance", …)` sur la page devis, et
--    `requirePermission("finance", …)` sur créer/ajouter une ligne/changer le statut). Un
--    comptable disposant de `finance:*` mais pas de `crm:*` ne pouvait ni lire ni modifier un
--    devis. Le contrôle redevient aligné sur le code : `finance`.
--
-- Sans les rôles Supabase (PGlite, PostgreSQL auto-hébergé) : seuls le point 3 et la
-- normalisation des ACL s'appliquent. Ré-exécutable sans effet secondaire.
-- =====================================================================

-- ---------------------------------------------------------------- 1. Politiques « devis » → finance

drop policy if exists quotes_select on quotes;
create policy quotes_select on quotes for select
  using (app.has_permission(organization_id, 'finance', 'read'));

drop policy if exists quotes_insert on quotes;
create policy quotes_insert on quotes for insert
  with check (app.has_permission(organization_id, 'finance', 'create'));

drop policy if exists quotes_update on quotes;
create policy quotes_update on quotes for update
  using (app.has_permission(organization_id, 'finance', 'update'))
  with check (app.has_permission(organization_id, 'finance', 'update'));

drop policy if exists quotes_delete on quotes;
create policy quotes_delete on quotes for delete
  using (app.has_permission(organization_id, 'finance', 'delete'));

drop policy if exists quote_items_select on quote_items;
create policy quote_items_select on quote_items for select
  using (
    exists (
      select 1 from quotes q
      where q.id = quote_items.quote_id
        and app.has_permission(q.organization_id, 'finance', 'read')
    )
  );

drop policy if exists quote_items_insert on quote_items;
create policy quote_items_insert on quote_items for insert
  with check (
    exists (
      select 1 from quotes q
      where q.id = quote_items.quote_id
        and app.has_permission(q.organization_id, 'finance', 'create')
    )
  );

drop policy if exists quote_items_update on quote_items;
create policy quote_items_update on quote_items for update
  using (
    exists (
      select 1 from quotes q
      where q.id = quote_items.quote_id
        and app.has_permission(q.organization_id, 'finance', 'update')
    )
  )
  with check (
    exists (
      select 1 from quotes q
      where q.id = quote_items.quote_id
        and app.has_permission(q.organization_id, 'finance', 'update')
    )
  );

drop policy if exists quote_items_delete on quote_items;
create policy quote_items_delete on quote_items for delete
  using (
    exists (
      select 1 from quotes q
      where q.id = quote_items.quote_id
        and (app.has_permission(q.organization_id, 'finance', 'delete')
             or app.has_permission(q.organization_id, 'finance', 'update'))
    )
  );

-- ---------------------------------------------------------------- 2. ACL : plus aucun EXECUTE via PUBLIC
--
-- Les migrations 0001→0025 laissent plusieurs fonctions avec `proacl` NULL, c'est-à-dire
-- exécutables par PUBLIC (donc par tout rôle, y compris `anon`, dès qu'il a l'usage du
-- schéma). On rend les droits explicites : `organix_app` toujours, `authenticated` et
-- `service_role` sur Supabase. Aucune fonction de déclencheur n'est exposée.

do $acl$
declare
  fn record;
begin
  for fn in
    select n.nspname as nsp, p.proname as name,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('app', 'public')
      and p.prokind = 'f'
    order by 1, 2
  loop
    execute format('revoke execute on function %I.%I(%s) from public', fn.nsp, fn.name, fn.args);
  end loop;

  if exists (select 1 from pg_roles where rolname = 'organix_app') then
    execute 'grant execute on all functions in schema app to organix_app';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on all functions in schema app to service_role';
    execute 'grant execute on all functions in schema public to service_role';
    -- `rls_auto_enable()` est fourni par la plateforme, pas par le dépôt : il est absent en
    -- local mais présent en production, et son `proacl` d'origine le laissait exécutable par anon.
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
      execute 'revoke execute on function public.rls_auto_enable() from anon, authenticated';
    end if;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    -- Prédicats de RLS : sans eux toute politique est inévaluable sous ce rôle.
    execute 'grant execute on all functions in schema app to authenticated';
  end if;

  -- RPC métier : ce sont les points d'entrée voulus du modèle « RPC assumé » (0023).
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = 'bootstrap_organization') then
      execute 'grant execute on function public.bootstrap_organization(text, text, text, text, text, text, text, text) to authenticated';
    end if;
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = 'add_organization_member_by_email') then
      execute 'grant execute on function public.add_organization_member_by_email(uuid, text, uuid, uuid, text) to authenticated';
    end if;
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = 'convert_quote_to_invoice') then
      execute 'grant execute on function public.convert_quote_to_invoice(uuid, text, date) to authenticated';
    end if;
  end if;

  -- Les déclencheurs de notification restent fermés aux appelants HTTP (0017/0020/0023).
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on all functions in schema app from anon';
  end if;
end
$acl$;

-- ---------------------------------------------------------------- 3. Usage du schéma `app` (Supabase)

do $usage$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise notice 'rôles Supabase absents : usage du schéma app inchangé';
    return;
  end if;

  -- Indispensable : c'est ici que vivent les prédicats évalués par les politiques RLS.
  -- Sans cet usage, PostgreSQL répond « permission denied for schema app » avant même
  -- d'entrer dans la fonction, et TOUTE lecture PostgREST/Realtime échoue.
  execute 'grant usage on schema app to authenticated';
  raise notice 'usage du schéma app accordé à authenticated (politiques RLS évaluables)';

  -- `anon` reste dehors : aucune politique ne lui est destinée et il n'a aucun jeton.
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema app from anon';
  end if;
end
$usage$;
