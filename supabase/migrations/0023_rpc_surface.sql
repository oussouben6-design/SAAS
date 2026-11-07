-- =====================================================================
-- 0023 — Surface RPC assumée : ce qui reste fermé, ce qui est nécessaire
--
-- La décision de modèle est « RPC PostgREST assumé » (avec `0022` qui rend le contexte RLS
-- lisible depuis le jeton). Ce que cela change, et seulement cela :
--
-- 1. Realtime. Les abonnements `supabase_realtime` sur `public.notifications` (ajouté par `0017`)
--    sont contrôlés par RLS **sous le rôle de l'abonné** : sans privilège `SELECT` sur la table,
--    l'abonné ne reçoit rien. On accorde donc `SELECT` sur cette seule table à `authenticated`.
--    Le filtre reste la politique `notifications_select` (`user_id = app.current_user_id()`),
--    désormais exact grâce à `0022` : un abonné ne voit que ses propres notifications.
--    Aucune autre table ne reçoit de privilège — `0013` et `0020` restent applicables.
-- 2. Fonctions de service. `public.handle_new_user()` (déclencheur AFTER INSERT sur `auth.users`)
--    et `public.rls_auto_enable()` (déclencheur d'événement de la plateforme) n'ont rien à
--    exécuter depuis HTTP : `0020` révoquait `EXECUTE` à `public` seulement, ce qui laissait
--    subsister les autorisations nominales explicites. On les révoque nommément.
-- 3. Les RPC métier (`bootstrap_organization`, `add_organization_member_by_email`,
--    `convert_quote_to_invoice`) gardent `EXECUTE` pour `authenticated` + `service_role` (accordé
--    par `0015`/`0016`/`0018`) : c'est le point d'entrée voulu, et leur corps contrôle déjà les
--    permissions via `app.has_permission` — qui fonctionne maintenant.
--
-- Sans les rôles/schema Supabase (PGlite, PostgreSQL auto-hébergé) : sans effet.
-- =====================================================================

do $rpc$
declare
  has_authenticated boolean := exists (select 1 from pg_roles where rolname = 'authenticated');
begin
  -- 1. Temps réel : SELECT sur la seule table nécessaire, sous contrôle RLS.
  if has_authenticated
     and exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    execute 'grant select on public.notifications to authenticated';
    raise notice 'SELECT accordé à authenticated sur public.notifications (RLS appliquée, temps réel)';
  end if;

  -- 2. Fonctions de déclencheur : aucune exécution possible depuis HTTP.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'handle_new_user') then
    execute 'revoke execute on function public.handle_new_user() from anon, authenticated';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
    execute 'revoke execute on function public.rls_auto_enable() from anon, authenticated';
  end if;
end
$rpc$;

-- Le privilège de lecture accordé ci-dessus doit être retiré si la publication temps réel est
-- désactivée un jour : `npm run db:audit` vérifie que `authenticated` ne peut lire QUE
-- `notifications` (voir `SUPABASE_ONLY_GRANTS` dans `scripts/db-audit.ts`).
