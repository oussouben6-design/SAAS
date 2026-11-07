-- =====================================================================
-- 0015 — Pont « auth » Supabase (RÉCUPÉRATION de dérive, 7 novembre 2026)
--
-- Ces objets existent sur le projet Supabase `opnlvqwbevnivfjpbrxa` (appliqués le
-- 2026-11-07 à 20:36 UTC) mais n'ont JAMAIS été commités : le journal `app.migrations`
-- les mentionnait sans fichier correspondant dans le dépôt. Ils sont reconstruits ici à
-- partir de l'état réel de la base (`pg_get_functiondef`, `pg_get_triggerdef`) pour qu'une
-- base neuve reproduise la production — et pour que `npm run db:audit` ne signale plus une
-- dérive.
--
-- Contenu :
--   • public.handle_new_user : crée la ligne `profiles` à l'inscription Supabase, branchée
--     par le déclencheur `on_auth_user_created` sur `auth.users` ;
--   • public.bootstrap_organization : onboarding complet (organisation, rôles, permissions,
--     modules, pipeline, catégories, départements, journal) exposé en RPC PostgREST.
--
-- Sans schéma `auth` (PGlite, PostgreSQL auto-hébergé) : sans effet, comme 0013.
-- =====================================================================

do $bridge$
declare
  has_auth boolean := exists (select 1 from pg_namespace where nspname = 'auth');
  has_service_role boolean := exists (select 1 from pg_roles where rolname = 'service_role');
begin
  if not has_auth then
    raise notice 'schéma auth absent : pont d''authentification Supabase ignoré';
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
    on conflict (id) do nothing;
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

  create or replace function public.bootstrap_organization(
    p_name text,
    p_slug text default null,
    p_currency text default 'XOF',
    p_timezone text default 'Africa/Niamey',
    p_language text default 'fr',
    p_industry text default null,
    p_city text default null,
    p_country text default null
  ) returns uuid
  language plpgsql security definer set search_path = public, pg_temp
  as $fn$
  declare
    uid uuid := auth.uid();
    user_email text;
    user_name text;
    org_id uuid;
    member_id uuid;
    base_slug text;
    final_slug text;
    i integer := 0;
  begin
    if uid is null then
      raise exception 'Authentification requise';
    end if;
    if p_name is null or char_length(trim(p_name)) < 2 then
      raise exception 'Le nom de l''organisation doit contenir au moins 2 caractères';
    end if;
    if p_currency !~ '^[A-Z]{3}$' then
      raise exception 'Devise invalide';
    end if;

    select email, coalesce(nullif(trim(raw_user_meta_data->>'full_name'), ''), split_part(email, '@', 1))
      into user_email, user_name
    from auth.users where id = uid;
    if user_email is null then
      raise exception 'Utilisateur introuvable';
    end if;

    insert into public.profiles (id, email, full_name)
    values (uid, user_email, user_name)
    on conflict (id) do nothing;

    base_slug := coalesce(nullif(trim(p_slug), ''), lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g')));
    base_slug := trim(both '-' from base_slug);
    if base_slug = '' then base_slug := 'organisation'; end if;
    final_slug := base_slug;
    while exists (select 1 from public.organizations where slug = final_slug) loop
      i := i + 1;
      final_slug := base_slug || '-' || i::text;
    end loop;

    insert into public.organizations (name, slug, currency, timezone, language, industry, city, country, created_by, onboarding_completed_at)
    values (trim(p_name), final_slug, p_currency, p_timezone, p_language, p_industry, p_city, p_country, uid, now())
    returning id into org_id;

    insert into public.organization_members (organization_id, user_id, status, is_owner, joined_at)
    values (org_id, uid, 'active', true, now())
    returning id into member_id;

    insert into public.roles (organization_id, key, name, description, is_system, rank) values
      (org_id, 'owner', 'Propriétaire', 'Accès complet à l''organisation', true, 0),
      (org_id, 'admin', 'Administrateur', 'Administration de l''organisation', true, 10),
      (org_id, 'manager', 'Manager', 'Gestion opérationnelle des modules', true, 20),
      (org_id, 'member', 'Membre', 'Contribution aux projets et tâches', true, 30),
      (org_id, 'viewer', 'Lecteur', 'Consultation seule', true, 40);

    insert into public.role_permissions (role_id, permission_id)
    select r.id, p.id from public.roles r cross join public.permissions p
    where r.organization_id = org_id and r.key in ('owner', 'admin');

    insert into public.role_permissions (role_id, permission_id)
    select r.id, p.id from public.roles r join public.permissions p on (
      p.action = 'read'
      or (p.action in ('create', 'update') and p.module in ('crm','prospection','projects','tasks','documents','hr','finance','partners','communication'))
      or (p.action = 'validate' and p.module in ('hr','finance'))
      or (p.action = 'export' and p.module in ('crm','finance','hr','projects','partners','reports'))
    )
    where r.organization_id = org_id and r.key = 'manager';

    insert into public.role_permissions (role_id, permission_id)
    select r.id, p.id from public.roles r join public.permissions p on (
      (p.action = 'read' and p.module in ('dashboard','crm','projects','tasks','documents','communication','organization'))
      or (p.action in ('create','update') and p.module in ('tasks','documents','communication'))
    )
    where r.organization_id = org_id and r.key = 'member';

    insert into public.role_permissions (role_id, permission_id)
    select r.id, p.id from public.roles r join public.permissions p on p.action = 'read'
    where r.organization_id = org_id and r.key = 'viewer';

    insert into public.member_roles (member_id, role_id)
    select member_id, id from public.roles where organization_id = org_id and key = 'owner';

    insert into public.organization_modules (organization_id, module_key, enabled)
    select org_id, k, true from unnest(array[
      'dashboard','crm','prospection','projects','tasks','documents','hr','finance',
      'partners','communication','members','roles','organization','audit','reports','ai'
    ]) as k;

    insert into public.pipeline_stages (organization_id, name, position, probability, is_won, is_lost) values
      (org_id, 'Nouveau', 10, 10, false, false),
      (org_id, 'Contacté', 20, 25, false, false),
      (org_id, 'Qualifié', 30, 50, false, false),
      (org_id, 'Proposition', 40, 70, false, false),
      (org_id, 'Négociation', 50, 85, false, false),
      (org_id, 'Gagné', 60, 100, true, false),
      (org_id, 'Perdu', 70, 0, false, true);

    insert into public.customer_categories (organization_id, name, color) values
      (org_id, 'Standard', '#64748b'),
      (org_id, 'Premium', '#8b5cf6'),
      (org_id, 'Stratégique', '#f59e0b');

    insert into public.financial_categories (organization_id, kind, name) values
      (org_id, 'income', 'Ventes de services'),
      (org_id, 'income', 'Prestations'),
      (org_id, 'income', 'Abonnements'),
      (org_id, 'expense', 'Salaires'),
      (org_id, 'expense', 'Bureaux'),
      (org_id, 'expense', 'Déplacements'),
      (org_id, 'expense', 'Marketing'),
      (org_id, 'expense', 'Logiciels');

    insert into public.departments (organization_id, name, code) values
      (org_id, 'Direction', 'DIR'),
      (org_id, 'Commercial', 'COM'),
      (org_id, 'Finance & Comptabilité', 'FIN'),
      (org_id, 'Ressources Humaines', 'RH'),
      (org_id, 'Technique', 'TECH');

    insert into public.audit_logs (organization_id, actor_id, actor_email, action, entity_type, entity_id, summary)
    values (org_id, uid, user_email, 'organization.created', 'organization', org_id, 'Organisation créée : ' || trim(p_name));

    return org_id;
  end;
  $fn$;

  revoke execute on function public.bootstrap_organization(
    text, text, text, text, text, text, text, text
  ) from public;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    -- RPC d'onboarding : appelable par un utilisateur connecté (modèle PostgREST de 0015).
    execute 'grant execute on function public.bootstrap_organization(text, text, text, text, text, text, text, text) to authenticated';
  end if;
  if has_service_role then
    grant execute on function public.bootstrap_organization(
      text, text, text, text, text, text, text, text
    ) to service_role;
  end if;
end
$bridge$;
