-- =====================================================================
-- 0024 — Synchro de vérification d'e-mail Supabase Auth → profiles
-- (RÉCUPÉRATION de dérive, 11 novembre 2026)
--
-- Ces objets existent sur le projet Supabase `opnlvqwbevnivfjpbrxa` (appliqués le
-- 2026-11-10 à 13:58 et 15:11 UTC — journal `app.migrations` :
-- `0024_supabase_email_verification_sync.sql` ; historique du connecteur Supabase :
-- `0024_supabase_auth_profile_trigger_conflict`) mais n'ont JAMAIS été commités.
-- Reconstruits ici à partir de l'état réel de la base (`pg_get_functiondef`,
-- `pg_get_triggerdef`) pour qu'une base neuve reproduise la production — même
-- méthode que `0015`.
--
-- Deux effets (tous deux SECURITY DEFINER, branchés sur `auth.users`) :
--   • public.handle_new_user : crée la ligne `profiles` à l'inscription Supabase.
--     Corps reconduit À L'IDENTIQUE de l'état actuel de la production
--     (`on conflict do nothing` — la variante `on conflict (id) do nothing` de
--     0015 a été modifiée hors Git le 10 nov. 2026 : le conflit d'insertion
--     (p. ex. e-mail déjà présent) est désormais absorbé silencieusement) ;
--   • public.sync_auth_email_confirmation : reporte `email_confirmed_at` sur
--     `profiles.email_verified_at` à la confirmation d'adresse.
--
-- Durcissement appliqué au rejeu (conforme 0013/0015) : EXECUTE retiré à PUBLIC,
-- anon et authenticated — ce sont des déclencheurs internes, et leur EXECUTE
-- public présent dans la base était un reste du drift. Le déclenchement par
-- trigger n'est pas affecté (SECURITY DEFINER + propriétaire).
--
-- Sans schéma `auth` (PGlite, PostgreSQL auto-hébergé) : sans effet, comme 0013/0015.
-- =====================================================================

do $sync$
declare
  has_auth boolean := exists (select 1 from pg_namespace where nspname = 'auth');
  has_service_role boolean := exists (select 1 from pg_roles where rolname = 'service_role');
begin
  if not has_auth then
    raise notice 'schéma auth absent : synchro e-mail Supabase Auth ignorée';
    return;
  end if;

  create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public, pg_temp
  as $fn$
    begin
      insert into public.profiles (id, email, full_name, avatar_url, email_verified_at)
      values (
        new.id,
        new.email,
        coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)),
        new.raw_user_meta_data->>'avatar_url',
        new.email_confirmed_at
      )
      on conflict do nothing;
      return new;
    end;
    $fn$;

  drop trigger if exists on_auth_user_created on auth.users;
  create trigger on_auth_user_created after insert on auth.users
    for each row execute function public.handle_new_user();

  -- Trigger interne : aucun appelant direct, on referme l'exécution publique.
  revoke execute on function public.handle_new_user() from public;
  if has_service_role then
    grant execute on function public.handle_new_user() to service_role;
  end if;

  create or replace function public.sync_auth_email_confirmation() returns trigger
  language plpgsql security definer set search_path = public, pg_temp
  as $fn$
  begin
    if new.email_confirmed_at is not null and new.email_confirmed_at is distinct from old.email_confirmed_at then
      update public.profiles
      set email_verified_at = coalesce(email_verified_at, new.email_confirmed_at)
      where id = new.id;
    end if;
    return new;
  end;
  $fn$;

  drop trigger if exists on_auth_user_email_confirmed on auth.users;
  create trigger on_auth_user_email_confirmed after update of email_confirmed_at on auth.users
    for each row
    when (new.email_confirmed_at is not null and old.email_confirmed_at is distinct from new.email_confirmed_at)
    execute function public.sync_auth_email_confirmation();

  -- Trigger interne : on referme l'exécution publique
  -- (reste du drift : anon/authenticated avaient EXECUTE).
  revoke execute on function public.sync_auth_email_confirmation() from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.sync_auth_email_confirmation() from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.sync_auth_email_confirmation() from authenticated;
  end if;
  if has_service_role then
    grant execute on function public.sync_auth_email_confirmation() to service_role;
  end if;
end
$sync$;
