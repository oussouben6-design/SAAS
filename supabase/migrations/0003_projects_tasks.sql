-- ORGANIX — Migration 0003 : projets, jalons et tâches

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 160),
  code text,
  description text,
  objectives text,
  customer_id uuid references customers (id) on delete set null,
  department_id uuid references departments (id) on delete set null,
  manager_id uuid references profiles (id) on delete set null,
  status text not null default 'planning' check (status in ('planning', 'active', 'on_hold', 'completed', 'cancelled')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  start_date date,
  end_date date,
  budget_minor bigint not null default 0 check (budget_minor >= 0),
  currency text not null default 'XOF' check (currency ~ '^[A-Z]{3}$'),
  progress integer not null default 0 check (progress between 0 and 100),
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint projects_dates_check check (end_date is null or start_date is null or end_date >= start_date)
);

create index if not exists projects_org_idx on projects (organization_id) where deleted_at is null;
create index if not exists projects_manager_idx on projects (manager_id);

create table if not exists project_members (
  project_id uuid not null references projects (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('manager', 'member', 'observer')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table if not exists project_milestones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 160),
  description text,
  due_date date,
  completed_at timestamptz,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_milestones_project_idx on project_milestones (project_id, position);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  project_id uuid references projects (id) on delete cascade,
  parent_task_id uuid references tasks (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 200),
  description text,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'review', 'done', 'blocked')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  assignee_id uuid references profiles (id) on delete set null,
  due_date date,
  completed_at timestamptz,
  position integer not null default 0,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists tasks_org_idx on tasks (organization_id) where deleted_at is null;
create index if not exists tasks_project_idx on tasks (project_id) where deleted_at is null;
create index if not exists tasks_assignee_idx on tasks (assignee_id, status);
create index if not exists tasks_due_idx on tasks (organization_id, due_date) where deleted_at is null and completed_at is null;

create table if not exists task_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  task_id uuid not null references tasks (id) on delete cascade,
  author_id uuid references profiles (id) on delete set null,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists task_comments_task_idx on task_comments (task_id, created_at);

drop trigger if exists projects_set_updated_at on projects;
create trigger projects_set_updated_at before update on projects
  for each row execute function app.set_updated_at();
drop trigger if exists project_milestones_set_updated_at on project_milestones;
create trigger project_milestones_set_updated_at before update on project_milestones
  for each row execute function app.set_updated_at();
drop trigger if exists tasks_set_updated_at on tasks;
create trigger tasks_set_updated_at before update on tasks
  for each row execute function app.set_updated_at();
drop trigger if exists task_comments_set_updated_at on task_comments;
create trigger task_comments_set_updated_at before update on task_comments
  for each row execute function app.set_updated_at();

alter table projects enable row level security;
alter table projects force row level security;
alter table project_members enable row level security;
alter table project_members force row level security;
alter table project_milestones enable row level security;
alter table project_milestones force row level security;
alter table tasks enable row level security;
alter table tasks force row level security;
alter table task_comments enable row level security;
alter table task_comments force row level security;

drop policy if exists projects_select on projects;
create policy projects_select on projects for select
  using (app.is_member(organization_id) and deleted_at is null);
drop policy if exists projects_insert on projects;
create policy projects_insert on projects for insert
  with check (app.has_permission(organization_id, 'projects', 'create'));
drop policy if exists projects_update on projects;
create policy projects_update on projects for update
  using (app.has_permission(organization_id, 'projects', 'update'))
  with check (app.has_permission(organization_id, 'projects', 'update'));
drop policy if exists projects_delete on projects;
create policy projects_delete on projects for delete
  using (app.has_permission(organization_id, 'projects', 'delete'));

drop policy if exists project_members_select on project_members;
create policy project_members_select on project_members for select
  using (exists (select 1 from projects p where p.id = project_id and app.is_member(p.organization_id)));
drop policy if exists project_members_write on project_members;
create policy project_members_write on project_members for all
  using (exists (select 1 from projects p where p.id = project_id and app.has_permission(p.organization_id, 'projects', 'update')))
  with check (exists (select 1 from projects p where p.id = project_id and app.has_permission(p.organization_id, 'projects', 'update')));

drop policy if exists project_milestones_select on project_milestones;
create policy project_milestones_select on project_milestones for select
  using (app.is_member(organization_id));
drop policy if exists project_milestones_write on project_milestones;
create policy project_milestones_write on project_milestones for all
  using (app.has_permission(organization_id, 'projects', 'update'))
  with check (app.has_permission(organization_id, 'projects', 'update'));

drop policy if exists tasks_select on tasks;
create policy tasks_select on tasks for select
  using (app.is_member(organization_id) and deleted_at is null);
drop policy if exists tasks_insert on tasks;
create policy tasks_insert on tasks for insert
  with check (app.has_permission(organization_id, 'tasks', 'create'));
drop policy if exists tasks_update on tasks;
create policy tasks_update on tasks for update
  using (app.has_permission(organization_id, 'tasks', 'update') or assignee_id = app.current_user_id() or created_by = app.current_user_id())
  with check (app.has_permission(organization_id, 'tasks', 'update') or assignee_id = app.current_user_id() or created_by = app.current_user_id());
drop policy if exists tasks_delete on tasks;
create policy tasks_delete on tasks for delete
  using (app.has_permission(organization_id, 'tasks', 'delete'));

drop policy if exists task_comments_select on task_comments;
create policy task_comments_select on task_comments for select
  using (app.is_member(organization_id));
drop policy if exists task_comments_insert on task_comments;
create policy task_comments_insert on task_comments for insert
  with check (app.has_permission(organization_id, 'tasks', 'read'));
drop policy if exists task_comments_delete on task_comments;
create policy task_comments_delete on task_comments for delete
  using (author_id = app.current_user_id() or app.has_permission(organization_id, 'tasks', 'delete'));

grant select, insert, update, delete on all tables in schema public to organix_app;
grant execute on all functions in schema app to organix_app;
