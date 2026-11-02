-- ORGANIX — Migration 0001 : socle (organisations, utilisateurs, rôles, permissions)
-- Compatible PostgreSQL 15+ (Supabase) et PGlite (Postgres embarqué de développement).

create schema if not exists app;

-- Rôle applicatif non-superutilisateur : toutes les requêtes métier passent par ce rôle
-- afin que les politiques RLS soient réellement appliquées (un superutilisateur les contourne).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'organix_app') then
    execute 'create role organix_app nologin';
  end if;
end
$$;

-- ---------------------------------------------------------------- profils

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  avatar_url text,
  phone text,
  job_title text,
  locale text not null default 'fr',
  timezone text not null default 'Africa/Niamey',
  email_verified_at timestamptz,
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_email_unique on profiles (lower(email));

-- ---------------------------------------------------------------- organisations

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  slug text not null unique,
  legal_name text,
  logo_url text,
  address text,
  city text,
  country text,
  phone text,
  email text,
  website text,
  description text,
  industry text,
  currency text not null default 'XOF' check (currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'Africa/Niamey',
  language text not null default 'fr' check (language in ('fr', 'en')),
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  onboarding_completed_at timestamptz,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 120),
  code text,
  description text,
  parent_id uuid references departments (id) on delete set null,
  manager_id uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, name)
);

create index if not exists departments_org_idx on departments (organization_id);

create table if not exists organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  department_id uuid references departments (id) on delete set null,
  job_title text,
  status text not null default 'active' check (status in ('invited', 'active', 'suspended')),
  is_owner boolean not null default false,
  invited_email text,
  invited_by uuid references profiles (id) on delete set null,
  invitation_token_hash text,
  invitation_expires_at timestamptz,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists organization_members_org_idx on organization_members (organization_id);
create index if not exists organization_members_user_idx on organization_members (user_id);
create index if not exists organization_members_token_idx on organization_members (invitation_token_hash)
  where invitation_token_hash is not null;

-- ---------------------------------------------------------------- rôles & permissions

create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]{2,40}$'),
  name text not null check (char_length(trim(name)) between 2 and 80),
  description text,
  is_system boolean not null default false,
  rank integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);

create index if not exists roles_org_idx on roles (organization_id);

create table if not exists permissions (
  id uuid primary key default gen_random_uuid(),
  module text not null,
  action text not null check (action in ('read', 'create', 'update', 'delete', 'validate', 'export', 'administer')),
  description text,
  unique (module, action)
);

create table if not exists role_permissions (
  role_id uuid not null references roles (id) on delete cascade,
  permission_id uuid not null references permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

create table if not exists member_roles (
  member_id uuid not null references organization_members (id) on delete cascade,
  role_id uuid not null references roles (id) on delete cascade,
  primary key (member_id, role_id)
);

create index if not exists member_roles_role_idx on member_roles (role_id);

create table if not exists organization_modules (
  organization_id uuid not null references organizations (id) on delete cascade,
  module_key text not null,
  enabled boolean not null default true,
  primary key (organization_id, module_key)
);

-- ---------------------------------------------------------------- audit & notifications

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations (id) on delete cascade,
  actor_id uuid references profiles (id) on delete set null,
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_org_created_idx on audit_logs (organization_id, created_at desc);
create index if not exists audit_logs_entity_idx on audit_logs (entity_type, entity_id);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  type text not null default 'info',
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on notifications (user_id, created_at desc);

-- ---------------------------------------------------------------- authentification (accès privilégié uniquement)

create table if not exists user_credentials (
  user_id uuid primary key references profiles (id) on delete cascade,
  password_hash text not null,
  password_salt text not null,
  algorithm text not null default 'scrypt',
  password_updated_at timestamptz not null default now()
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  token_hash text not null unique,
  ip text,
  user_agent text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

create index if not exists sessions_user_idx on sessions (user_id);

create table if not exists verification_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  purpose text not null check (purpose in ('email_verification', 'password_reset', 'invitation')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists verification_tokens_user_idx on verification_tokens (user_id, purpose);

-- ---------------------------------------------------------------- fonctions utilitaires

create or replace function app.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function app.current_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('organix.user_id', true), '')::uuid;
$$;

create or replace function app.is_member(org uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from organization_members m
    where m.organization_id = org
      and m.user_id = app.current_user_id()
      and m.status = 'active'
  );
$$;

create or replace function app.has_permission(org uuid, module_name text, perm_action text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from organization_members m
    join member_roles mr on mr.member_id = m.id
    join role_permissions rp on rp.role_id = mr.role_id
    join permissions p on p.id = rp.permission_id
    where m.organization_id = org
      and m.user_id = app.current_user_id()
      and m.status = 'active'
      and p.module = module_name
      and p.action = perm_action
  );
$$;

create or replace function app.is_org_admin(org uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from organization_members m
    where m.organization_id = org
      and m.user_id = app.current_user_id()
      and m.status = 'active'
      and (m.is_owner or app.has_permission(org, 'organization', 'administer'))
  );
$$;

create or replace function app.can_view_profile(profile_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select profile_id = app.current_user_id()
    or exists (
      select 1
      from organization_members me
      join organization_members other on other.organization_id = me.organization_id
      where me.user_id = app.current_user_id()
        and me.status = 'active'
        and other.user_id = profile_id
        and other.status in ('active', 'invited')
    );
$$;

create or replace function app.current_org_member_id(org uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select m.id
  from organization_members m
  where m.organization_id = org
    and m.user_id = app.current_user_id()
    and m.status = 'active'
  limit 1;
$$;

-- ---------------------------------------------------------------- triggers updated_at

drop trigger if exists profiles_set_updated_at on profiles;
create trigger profiles_set_updated_at before update on profiles
  for each row execute function app.set_updated_at();

drop trigger if exists organizations_set_updated_at on organizations;
create trigger organizations_set_updated_at before update on organizations
  for each row execute function app.set_updated_at();

drop trigger if exists departments_set_updated_at on departments;
create trigger departments_set_updated_at before update on departments
  for each row execute function app.set_updated_at();

drop trigger if exists organization_members_set_updated_at on organization_members;
create trigger organization_members_set_updated_at before update on organization_members
  for each row execute function app.set_updated_at();

drop trigger if exists roles_set_updated_at on roles;
create trigger roles_set_updated_at before update on roles
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------- Row Level Security

alter table profiles enable row level security;
alter table profiles force row level security;
alter table organizations enable row level security;
alter table organizations force row level security;
alter table departments enable row level security;
alter table departments force row level security;
alter table organization_members enable row level security;
alter table organization_members force row level security;
alter table roles enable row level security;
alter table roles force row level security;
alter table permissions enable row level security;
alter table permissions force row level security;
alter table role_permissions enable row level security;
alter table role_permissions force row level security;
alter table member_roles enable row level security;
alter table member_roles force row level security;
alter table organization_modules enable row level security;
alter table organization_modules force row level security;
alter table audit_logs enable row level security;
alter table audit_logs force row level security;
alter table notifications enable row level security;
alter table notifications force row level security;
alter table user_credentials enable row level security;
alter table user_credentials force row level security;
alter table sessions enable row level security;
alter table sessions force row level security;
alter table verification_tokens enable row level security;
alter table verification_tokens force row level security;

drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select
  using (app.can_view_profile(id));
drop policy if exists profiles_insert_self on profiles;
create policy profiles_insert_self on profiles for insert
  with check (id = app.current_user_id());
drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles for update
  using (id = app.current_user_id())
  with check (id = app.current_user_id());

drop policy if exists organizations_select on organizations;
create policy organizations_select on organizations for select
  using (app.is_member(id) and deleted_at is null);
drop policy if exists organizations_update on organizations;
create policy organizations_update on organizations for update
  using (app.is_org_admin(id))
  with check (app.is_org_admin(id));

drop policy if exists departments_select on departments;
create policy departments_select on departments for select
  using (app.is_member(organization_id));
drop policy if exists departments_insert on departments;
create policy departments_insert on departments for insert
  with check (app.is_org_admin(organization_id));
drop policy if exists departments_update on departments;
create policy departments_update on departments for update
  using (app.is_org_admin(organization_id))
  with check (app.is_org_admin(organization_id));
drop policy if exists departments_delete on departments;
create policy departments_delete on departments for delete
  using (app.is_org_admin(organization_id));

drop policy if exists organization_members_select on organization_members;
create policy organization_members_select on organization_members for select
  using (app.is_member(organization_id) or user_id = app.current_user_id());
drop policy if exists organization_members_insert on organization_members;
create policy organization_members_insert on organization_members for insert
  with check (app.has_permission(organization_id, 'members', 'create') or app.has_permission(organization_id, 'members', 'administer'));
drop policy if exists organization_members_update on organization_members;
create policy organization_members_update on organization_members for update
  using (app.has_permission(organization_id, 'members', 'update') or app.has_permission(organization_id, 'members', 'administer'))
  with check (app.has_permission(organization_id, 'members', 'update') or app.has_permission(organization_id, 'members', 'administer'));
drop policy if exists organization_members_delete on organization_members;
create policy organization_members_delete on organization_members for delete
  using ((app.has_permission(organization_id, 'members', 'delete') or app.has_permission(organization_id, 'members', 'administer')) and not is_owner);

drop policy if exists roles_select on roles;
create policy roles_select on roles for select
  using (app.is_member(organization_id));
drop policy if exists roles_write on roles;
create policy roles_write on roles for all
  using (app.has_permission(organization_id, 'roles', 'administer'))
  with check (app.has_permission(organization_id, 'roles', 'administer'));

drop policy if exists permissions_select on permissions;
create policy permissions_select on permissions for select
  using (app.current_user_id() is not null);

drop policy if exists role_permissions_select on role_permissions;
create policy role_permissions_select on role_permissions for select
  using (exists (select 1 from roles r where r.id = role_id and app.is_member(r.organization_id)));
drop policy if exists role_permissions_write on role_permissions;
create policy role_permissions_write on role_permissions for all
  using (exists (select 1 from roles r where r.id = role_id and app.has_permission(r.organization_id, 'roles', 'administer')))
  with check (exists (select 1 from roles r where r.id = role_id and app.has_permission(r.organization_id, 'roles', 'administer')));

drop policy if exists member_roles_select on member_roles;
create policy member_roles_select on member_roles for select
  using (exists (
    select 1 from organization_members m
    where m.id = member_id and app.is_member(m.organization_id)
  ));
drop policy if exists member_roles_write on member_roles;
create policy member_roles_write on member_roles for all
  using (exists (
    select 1 from organization_members m
    where m.id = member_id and app.has_permission(m.organization_id, 'members', 'administer')
  ))
  with check (exists (
    select 1 from organization_members m
    where m.id = member_id and app.has_permission(m.organization_id, 'members', 'administer')
  ));

drop policy if exists organization_modules_select on organization_modules;
create policy organization_modules_select on organization_modules for select
  using (app.is_member(organization_id));
drop policy if exists organization_modules_write on organization_modules;
create policy organization_modules_write on organization_modules for all
  using (app.is_org_admin(organization_id))
  with check (app.is_org_admin(organization_id));

drop policy if exists audit_logs_select on audit_logs;
create policy audit_logs_select on audit_logs for select
  using (organization_id is not null and app.has_permission(organization_id, 'audit', 'read'));
drop policy if exists audit_logs_insert on audit_logs;
create policy audit_logs_insert on audit_logs for insert
  with check (organization_id is not null and app.is_member(organization_id));

drop policy if exists notifications_select on notifications;
create policy notifications_select on notifications for select
  using (user_id = app.current_user_id());
drop policy if exists notifications_update on notifications;
create policy notifications_update on notifications for update
  using (user_id = app.current_user_id())
  with check (user_id = app.current_user_id());
drop policy if exists notifications_insert on notifications;
create policy notifications_insert on notifications for insert
  with check (app.is_member(organization_id));
drop policy if exists notifications_delete on notifications;
create policy notifications_delete on notifications for delete
  using (user_id = app.current_user_id());

-- user_credentials, sessions, verification_tokens : aucune politique => aucun accès via le rôle applicatif.
-- Seul le service d'authentification (connexion privilégiée, côté serveur) y accède.

grant usage on schema public to organix_app;
grant usage on schema app to organix_app;
grant select, insert, update, delete on all tables in schema public to organix_app;
grant execute on all functions in schema app to organix_app;
