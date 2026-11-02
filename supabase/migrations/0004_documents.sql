-- ORGANIX — Migration 0004 : gestion documentaire

create table if not exists document_folders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  parent_id uuid references document_folders (id) on delete cascade,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, parent_id, name)
);

create index if not exists document_folders_org_idx on document_folders (organization_id);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  folder_id uuid references document_folders (id) on delete set null,
  name text not null check (char_length(trim(name)) between 1 and 200),
  description text,
  category text not null default 'general' check (category in ('general', 'contract', 'invoice', 'report', 'hr', 'project', 'legal', 'other')),
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  storage_provider text not null default 'local' check (storage_provider in ('local', 'supabase')),
  storage_path text not null,
  checksum text,
  entity_type text check (entity_type in ('customer', 'lead', 'opportunity', 'project', 'task', 'employee', 'invoice', 'partner', 'organization')),
  entity_id uuid,
  uploaded_by uuid references profiles (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_org_idx on documents (organization_id) where deleted_at is null;
create index if not exists documents_entity_idx on documents (entity_type, entity_id);
create index if not exists documents_folder_idx on documents (folder_id);

drop trigger if exists documents_set_updated_at on documents;
create trigger documents_set_updated_at before update on documents
  for each row execute function app.set_updated_at();

alter table document_folders enable row level security;
alter table document_folders force row level security;
alter table documents enable row level security;
alter table documents force row level security;

drop policy if exists document_folders_select on document_folders;
create policy document_folders_select on document_folders for select
  using (app.is_member(organization_id));
drop policy if exists document_folders_write on document_folders;
create policy document_folders_write on document_folders for all
  using (app.has_permission(organization_id, 'documents', 'update'))
  with check (app.has_permission(organization_id, 'documents', 'update'));

drop policy if exists documents_select on documents;
create policy documents_select on documents for select
  using (app.is_member(organization_id) and deleted_at is null);
drop policy if exists documents_insert on documents;
create policy documents_insert on documents for insert
  with check (app.has_permission(organization_id, 'documents', 'create'));
drop policy if exists documents_update on documents;
create policy documents_update on documents for update
  using (app.has_permission(organization_id, 'documents', 'update') or uploaded_by = app.current_user_id())
  with check (app.has_permission(organization_id, 'documents', 'update') or uploaded_by = app.current_user_id());
drop policy if exists documents_delete on documents;
create policy documents_delete on documents for delete
  using (app.has_permission(organization_id, 'documents', 'delete'));

grant select, insert, update, delete on all tables in schema public to organix_app;
grant execute on all functions in schema app to organix_app;
