-- =====================================================================
-- 0016 — Ajout d'un membre par e-mail (RÉCUPÉRATION de dérive, 7 novembre 2026)
--
-- Objet présent sur le projet Supabase `opnlvqwbevnivfjpbrxa` (2026-11-07 20:55 UTC), jamais
-- versionné. RPC `add_organization_member_by_email` : ajoute un membre existant à une
-- organisation à partir de son e-mail, avec contrôle de permission, journal d'audit et
-- notification. Sans schéma `auth` : sans effet.
-- =====================================================================

do $mby$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'uid'
  ) then
    raise notice 'fonction auth.uid() absente : RPC d''ajout de membre ignorée';
    return;
  end if;

  create or replace function public.add_organization_member_by_email(
    p_org_id uuid,
    p_email text,
    p_role_id uuid default null,
    p_department_id uuid default null,
    p_job_title text default null
  ) returns uuid
  language plpgsql security definer set search_path = public, pg_temp
  as $fn$
  declare
    uid uuid := auth.uid();
    target_profile_id uuid;
    new_member_id uuid;
    caller_email text;
  begin
    if uid is null then raise exception 'Authentification requise'; end if;
    if not (app.has_permission(p_org_id, 'members', 'create') or app.has_permission(p_org_id, 'members', 'administer')
            or exists (select 1 from organization_members m where m.organization_id = p_org_id and m.user_id = uid and m.is_owner and m.status = 'active')) then
      raise exception 'Permission refusée : vous ne pouvez pas ajouter de membres';
    end if;

    select id into target_profile_id from public.profiles where lower(email) = lower(trim(p_email)) limit 1;
    if target_profile_id is null then
      raise exception 'Aucun compte Excellence 360 avec cet email. La personne doit d''abord créer un compte.';
    end if;

    if exists (select 1 from organization_members where organization_id = p_org_id and user_id = target_profile_id) then
      raise exception 'Cette personne est déjà membre de l''organisation';
    end if;

    if p_role_id is not null and not exists (select 1 from roles where id = p_role_id and organization_id = p_org_id) then
      raise exception 'Rôle invalide pour cette organisation';
    end if;

    insert into organization_members (organization_id, user_id, status, is_owner, department_id, job_title, joined_at)
    values (p_org_id, target_profile_id, 'active', false, p_department_id, p_job_title, now())
    returning id into new_member_id;

    if p_role_id is not null then
      insert into member_roles (member_id, role_id) values (new_member_id, p_role_id);
    else
      insert into member_roles (member_id, role_id)
      select new_member_id, id from roles where organization_id = p_org_id and key = 'member';
    end if;

    select email into caller_email from profiles where id = uid;
    insert into audit_logs (organization_id, actor_id, actor_email, action, entity_type, entity_id, summary)
    values (p_org_id, uid, caller_email, 'members.added', 'Membre', new_member_id, 'Membre ajouté : ' || trim(p_email));

    insert into notifications (organization_id, user_id, type, title, body)
    values (p_org_id, target_profile_id, 'info', 'Vous avez rejoint une organisation', 'Vous avez été ajouté à une organisation sur Excellence 360.');

    return new_member_id;
  end;
  $fn$;

  revoke execute on function public.add_organization_member_by_email(uuid, text, uuid, uuid, text) from public;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.add_organization_member_by_email(uuid, text, uuid, uuid, text) to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.add_organization_member_by_email(uuid, text, uuid, uuid, text) to service_role;
  end if;
end
$mby$;
