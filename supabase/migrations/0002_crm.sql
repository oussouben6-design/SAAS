-- ORGANIX — Migration 0002 : CRM, prospection et pipeline commercial

create table if not exists customer_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 60),
  color text not null default 'slate',
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 160),
  category_id uuid references customer_categories (id) on delete set null,
  email text,
  phone text,
  website text,
  address text,
  city text,
  country text,
  tax_id text,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  owner_id uuid references profiles (id) on delete set null,
  notes text,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists customers_org_idx on customers (organization_id) where deleted_at is null;
create index if not exists customers_name_idx on customers (organization_id, lower(name));

create table if not exists customer_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  customer_id uuid not null references customers (id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  role_title text,
  email text,
  phone text,
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists customer_contacts_customer_idx on customer_contacts (customer_id) where deleted_at is null;

create table if not exists customer_interactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  customer_id uuid not null references customers (id) on delete cascade,
  type text not null default 'note' check (type in ('note', 'call', 'email', 'meeting', 'visit', 'other')),
  subject text not null check (char_length(trim(subject)) between 2 and 160),
  notes text,
  occurred_at timestamptz not null default now(),
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists customer_interactions_customer_idx on customer_interactions (customer_id, occurred_at desc);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 160),
  company text,
  email text,
  phone text,
  source text not null default 'direct' check (source in ('direct', 'referral', 'website', 'social', 'event', 'call', 'other')),
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'unqualified', 'converted')),
  owner_id uuid references profiles (id) on delete set null,
  notes text,
  next_follow_up_at timestamptz,
  converted_customer_id uuid references customers (id) on delete set null,
  converted_at timestamptz,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists leads_org_idx on leads (organization_id) where deleted_at is null;
create index if not exists leads_follow_up_idx on leads (organization_id, next_follow_up_at);

create table if not exists pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 80),
  position integer not null default 0,
  probability integer not null default 10 check (probability between 0 and 100),
  is_won boolean not null default false,
  is_lost boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 160),
  customer_id uuid references customers (id) on delete set null,
  lead_id uuid references leads (id) on delete set null,
  stage_id uuid not null references pipeline_stages (id) on delete restrict,
  amount_minor bigint not null default 0 check (amount_minor >= 0),
  currency text not null default 'XOF' check (currency ~ '^[A-Z]{3}$'),
  probability integer not null default 10 check (probability between 0 and 100),
  expected_close_date date,
  owner_id uuid references profiles (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'won', 'lost')),
  lost_reason text,
  notes text,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists opportunities_org_idx on opportunities (organization_id) where deleted_at is null;
create index if not exists opportunities_stage_idx on opportunities (stage_id);

create table if not exists sales_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  lead_id uuid references leads (id) on delete cascade,
  opportunity_id uuid references opportunities (id) on delete cascade,
  customer_id uuid references customers (id) on delete cascade,
  type text not null default 'task' check (type in ('task', 'call', 'email', 'meeting', 'reminder')),
  subject text not null check (char_length(trim(subject)) between 2 and 160),
  notes text,
  scheduled_at timestamptz,
  completed_at timestamptz,
  owner_id uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (lead_id is not null or opportunity_id is not null or customer_id is not null)
);

create index if not exists sales_activities_org_idx on sales_activities (organization_id, scheduled_at desc);

drop trigger if exists customers_set_updated_at on customers;
create trigger customers_set_updated_at before update on customers
  for each row execute function app.set_updated_at();
drop trigger if exists customer_contacts_set_updated_at on customer_contacts;
create trigger customer_contacts_set_updated_at before update on customer_contacts
  for each row execute function app.set_updated_at();
drop trigger if exists leads_set_updated_at on leads;
create trigger leads_set_updated_at before update on leads
  for each row execute function app.set_updated_at();
drop trigger if exists opportunities_set_updated_at on opportunities;
create trigger opportunities_set_updated_at before update on opportunities
  for each row execute function app.set_updated_at();
drop trigger if exists sales_activities_set_updated_at on sales_activities;
create trigger sales_activities_set_updated_at before update on sales_activities
  for each row execute function app.set_updated_at();

alter table customer_categories enable row level security;
alter table customer_categories force row level security;
alter table customers enable row level security;
alter table customers force row level security;
alter table customer_contacts enable row level security;
alter table customer_contacts force row level security;
alter table customer_interactions enable row level security;
alter table customer_interactions force row level security;
alter table leads enable row level security;
alter table leads force row level security;
alter table pipeline_stages enable row level security;
alter table pipeline_stages force row level security;
alter table opportunities enable row level security;
alter table opportunities force row level security;
alter table sales_activities enable row level security;
alter table sales_activities force row level security;

drop policy if exists customer_categories_select on customer_categories;
create policy customer_categories_select on customer_categories for select
  using (app.is_member(organization_id));
drop policy if exists customer_categories_write on customer_categories;
create policy customer_categories_write on customer_categories for all
  using (app.has_permission(organization_id, 'crm', 'update'))
  with check (app.has_permission(organization_id, 'crm', 'update'));

drop policy if exists customers_select on customers;
create policy customers_select on customers for select
  using (app.is_member(organization_id) and deleted_at is null);
drop policy if exists customers_insert on customers;
create policy customers_insert on customers for insert
  with check (app.has_permission(organization_id, 'crm', 'create'));
drop policy if exists customers_update on customers;
create policy customers_update on customers for update
  using (app.has_permission(organization_id, 'crm', 'update'))
  with check (app.has_permission(organization_id, 'crm', 'update'));
drop policy if exists customers_delete on customers;
create policy customers_delete on customers for delete
  using (app.has_permission(organization_id, 'crm', 'delete'));

drop policy if exists customer_contacts_select on customer_contacts;
create policy customer_contacts_select on customer_contacts for select
  using (app.is_member(organization_id) and deleted_at is null);
drop policy if exists customer_contacts_insert on customer_contacts;
create policy customer_contacts_insert on customer_contacts for insert
  with check (app.has_permission(organization_id, 'crm', 'create'));
drop policy if exists customer_contacts_update on customer_contacts;
create policy customer_contacts_update on customer_contacts for update
  using (app.has_permission(organization_id, 'crm', 'update'))
  with check (app.has_permission(organization_id, 'crm', 'update'));
drop policy if exists customer_contacts_delete on customer_contacts;
create policy customer_contacts_delete on customer_contacts for delete
  using (app.has_permission(organization_id, 'crm', 'delete'));

drop policy if exists customer_interactions_select on customer_interactions;
create policy customer_interactions_select on customer_interactions for select
  using (app.is_member(organization_id));
drop policy if exists customer_interactions_insert on customer_interactions;
create policy customer_interactions_insert on customer_interactions for insert
  with check (app.has_permission(organization_id, 'crm', 'create'));
drop policy if exists customer_interactions_delete on customer_interactions;
create policy customer_interactions_delete on customer_interactions for delete
  using (app.has_permission(organization_id, 'crm', 'delete'));

drop policy if exists leads_select on leads;
create policy leads_select on leads for select
  using (app.is_member(organization_id) and deleted_at is null);
drop policy if exists leads_insert on leads;
create policy leads_insert on leads for insert
  with check (app.has_permission(organization_id, 'prospection', 'create'));
drop policy if exists leads_update on leads;
create policy leads_update on leads for update
  using (app.has_permission(organization_id, 'prospection', 'update'))
  with check (app.has_permission(organization_id, 'prospection', 'update'));
drop policy if exists leads_delete on leads;
create policy leads_delete on leads for delete
  using (app.has_permission(organization_id, 'prospection', 'delete'));

drop policy if exists pipeline_stages_select on pipeline_stages;
create policy pipeline_stages_select on pipeline_stages for select
  using (app.is_member(organization_id));
drop policy if exists pipeline_stages_write on pipeline_stages;
create policy pipeline_stages_write on pipeline_stages for all
  using (app.has_permission(organization_id, 'prospection', 'update'))
  with check (app.has_permission(organization_id, 'prospection', 'update'));

drop policy if exists opportunities_select on opportunities;
create policy opportunities_select on opportunities for select
  using (app.is_member(organization_id) and deleted_at is null);
drop policy if exists opportunities_insert on opportunities;
create policy opportunities_insert on opportunities for insert
  with check (app.has_permission(organization_id, 'prospection', 'create'));
drop policy if exists opportunities_update on opportunities;
create policy opportunities_update on opportunities for update
  using (app.has_permission(organization_id, 'prospection', 'update'))
  with check (app.has_permission(organization_id, 'prospection', 'update'));
drop policy if exists opportunities_delete on opportunities;
create policy opportunities_delete on opportunities for delete
  using (app.has_permission(organization_id, 'prospection', 'delete'));

drop policy if exists sales_activities_select on sales_activities;
create policy sales_activities_select on sales_activities for select
  using (app.is_member(organization_id));
drop policy if exists sales_activities_insert on sales_activities;
create policy sales_activities_insert on sales_activities for insert
  with check (app.has_permission(organization_id, 'prospection', 'create') or app.has_permission(organization_id, 'crm', 'create'));
drop policy if exists sales_activities_update on sales_activities;
create policy sales_activities_update on sales_activities for update
  using (app.has_permission(organization_id, 'prospection', 'update') or app.has_permission(organization_id, 'crm', 'update'))
  with check (app.has_permission(organization_id, 'prospection', 'update') or app.has_permission(organization_id, 'crm', 'update'));

grant select, insert, update, delete on all tables in schema public to organix_app;
grant execute on all functions in schema app to organix_app;
