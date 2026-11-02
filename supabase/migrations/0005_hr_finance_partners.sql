-- ORGANIX — Migration 0005 : ressources humaines, finances, partenaires, communication

-- ---------------------------------------------------------------- Ressources humaines

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  user_id uuid references profiles (id) on delete set null,
  first_name text not null check (char_length(trim(first_name)) between 1 and 80),
  last_name text not null check (char_length(trim(last_name)) between 1 and 80),
  email text,
  phone text,
  department_id uuid references departments (id) on delete set null,
  job_title text,
  manager_id uuid references employees (id) on delete set null,
  contract_type text not null default 'cdi' check (contract_type in ('cdi', 'cdd', 'stage', 'consultant', 'interim')),
  hire_date date,
  end_date date,
  status text not null default 'active' check (status in ('active', 'on_leave', 'suspended', 'ended')),
  base_salary_minor bigint check (base_salary_minor is null or base_salary_minor >= 0),
  currency text not null default 'XOF' check (currency ~ '^[A-Z]{3}$'),
  notes text,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists employees_org_idx on employees (organization_id) where deleted_at is null;
create index if not exists employees_department_idx on employees (department_id);

create table if not exists employee_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  employee_id uuid not null references employees (id) on delete cascade,
  reference text,
  type text not null default 'cdi' check (type in ('cdi', 'cdd', 'stage', 'consultant', 'interim', 'avenant')),
  start_date date not null,
  end_date date,
  salary_minor bigint check (salary_minor is null or salary_minor >= 0),
  currency text not null default 'XOF' check (currency ~ '^[A-Z]{3}$'),
  signed_at date,
  document_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_contracts_dates_check check (end_date is null or end_date >= start_date)
);

create index if not exists employee_contracts_employee_idx on employee_contracts (employee_id);

create table if not exists leave_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  employee_id uuid not null references employees (id) on delete cascade,
  type text not null default 'annual' check (type in ('annual', 'sick', 'maternity', 'unpaid', 'other')),
  start_date date not null,
  end_date date not null,
  days numeric(5, 1) not null check (days > 0),
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by uuid references profiles (id) on delete set null,
  decided_at timestamptz,
  decision_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_requests_dates_check check (end_date >= start_date)
);

create index if not exists leave_requests_org_idx on leave_requests (organization_id, status);

create table if not exists attendance_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  employee_id uuid not null references employees (id) on delete cascade,
  work_date date not null,
  check_in time,
  check_out time,
  status text not null default 'present' check (status in ('present', 'absent', 'late', 'leave', 'remote')),
  notes text,
  created_at timestamptz not null default now(),
  unique (employee_id, work_date)
);

-- ---------------------------------------------------------------- Finances

create table if not exists financial_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  kind text not null check (kind in ('income', 'expense')),
  name text not null check (char_length(trim(name)) between 2 and 80),
  created_at timestamptz not null default now(),
  unique (organization_id, kind, name)
);

create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  number text not null,
  customer_id uuid references customers (id) on delete set null,
  subject text not null check (char_length(trim(subject)) between 2 and 200),
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'rejected', 'expired')),
  issue_date date not null default current_date,
  valid_until date,
  currency text not null default 'XOF' check (currency ~ '^[A-Z]{3}$'),
  subtotal_minor bigint not null default 0 check (subtotal_minor >= 0),
  tax_rate numeric(5, 2) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  total_minor bigint not null default 0 check (total_minor >= 0),
  notes text,
  terms text,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, number)
);

create table if not exists quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes (id) on delete cascade,
  description text not null check (char_length(trim(description)) between 1 and 300),
  quantity numeric(12, 2) not null default 1 check (quantity > 0),
  unit_price_minor bigint not null default 0 check (unit_price_minor >= 0),
  amount_minor bigint not null default 0 check (amount_minor >= 0),
  position integer not null default 0
);

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  number text not null,
  customer_id uuid not null references customers (id) on delete restrict,
  project_id uuid references projects (id) on delete set null,
  quote_id uuid references quotes (id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled')),
  issue_date date not null default current_date,
  due_date date,
  currency text not null default 'XOF' check (currency ~ '^[A-Z]{3}$'),
  subtotal_minor bigint not null default 0 check (subtotal_minor >= 0),
  tax_rate numeric(5, 2) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  tax_minor bigint not null default 0 check (tax_minor >= 0),
  total_minor bigint not null default 0 check (total_minor >= 0),
  amount_paid_minor bigint not null default 0 check (amount_paid_minor >= 0),
  notes text,
  terms text,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, number)
);

create index if not exists invoices_org_idx on invoices (organization_id, status) where deleted_at is null;

create table if not exists invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices (id) on delete cascade,
  description text not null check (char_length(trim(description)) between 1 and 300),
  quantity numeric(12, 2) not null default 1 check (quantity > 0),
  unit_price_minor bigint not null default 0 check (unit_price_minor >= 0),
  amount_minor bigint not null default 0 check (amount_minor >= 0),
  position integer not null default 0
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  invoice_id uuid not null references invoices (id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'XOF' check (currency ~ '^[A-Z]{3}$'),
  paid_at date not null default current_date,
  method text not null default 'transfer' check (method in ('cash', 'transfer', 'card', 'mobile_money', 'cheque', 'other')),
  reference text,
  notes text,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists payments_invoice_idx on payments (invoice_id);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  category_id uuid references financial_categories (id) on delete set null,
  label text not null check (char_length(trim(label)) between 2 and 200),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'XOF' check (currency ~ '^[A-Z]{3}$'),
  expense_date date not null default current_date,
  project_id uuid references projects (id) on delete set null,
  department_id uuid references departments (id) on delete set null,
  supplier text,
  method text not null default 'transfer' check (method in ('cash', 'transfer', 'card', 'mobile_money', 'cheque', 'other')),
  reference text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approved_by uuid references profiles (id) on delete set null,
  approved_at timestamptz,
  notes text,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists expenses_org_idx on expenses (organization_id, expense_date desc) where deleted_at is null;

create table if not exists revenues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  category_id uuid references financial_categories (id) on delete set null,
  label text not null check (char_length(trim(label)) between 2 and 200),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'XOF' check (currency ~ '^[A-Z]{3}$'),
  received_at date not null default current_date,
  invoice_id uuid references invoices (id) on delete set null,
  method text not null default 'transfer' check (method in ('cash', 'transfer', 'card', 'mobile_money', 'cheque', 'other')),
  reference text,
  notes text,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists revenues_org_idx on revenues (organization_id, received_at desc) where deleted_at is null;

-- ---------------------------------------------------------------- Partenaires

create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 160),
  type text not null default 'supplier' check (type in ('supplier', 'institution', 'distributor', 'ngo', 'other')),
  email text,
  phone text,
  website text,
  address text,
  city text,
  country text,
  contact_person text,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  notes text,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists partners_org_idx on partners (organization_id) where deleted_at is null;

create table if not exists partner_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  partner_id uuid not null references partners (id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  role_title text,
  email text,
  phone text,
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists partner_agreements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  partner_id uuid not null references partners (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 200),
  reference text,
  start_date date,
  end_date date,
  status text not null default 'active' check (status in ('draft', 'active', 'expired', 'terminated')),
  document_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- Communication interne

create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 200),
  body text not null,
  audience text not null default 'all' check (audience in ('all', 'department', 'admins')),
  department_id uuid references departments (id) on delete set null,
  is_pinned boolean not null default false,
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists announcements_org_idx on announcements (organization_id, published_at desc) where deleted_at is null;

create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 200),
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  location text,
  visibility text not null default 'organization' check (visibility in ('organization', 'department', 'private')),
  department_id uuid references departments (id) on delete set null,
  project_id uuid references projects (id) on delete set null,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint calendar_events_dates_check check (ends_at is null or ends_at >= starts_at)
);

create index if not exists calendar_events_org_idx on calendar_events (organization_id, starts_at);

drop trigger if exists employees_set_updated_at on employees;
create trigger employees_set_updated_at before update on employees
  for each row execute function app.set_updated_at();
drop trigger if exists employee_contracts_set_updated_at on employee_contracts;
create trigger employee_contracts_set_updated_at before update on employee_contracts
  for each row execute function app.set_updated_at();
drop trigger if exists leave_requests_set_updated_at on leave_requests;
create trigger leave_requests_set_updated_at before update on leave_requests
  for each row execute function app.set_updated_at();
drop trigger if exists quotes_set_updated_at on quotes;
create trigger quotes_set_updated_at before update on quotes
  for each row execute function app.set_updated_at();
drop trigger if exists invoices_set_updated_at on invoices;
create trigger invoices_set_updated_at before update on invoices
  for each row execute function app.set_updated_at();
drop trigger if exists expenses_set_updated_at on expenses;
create trigger expenses_set_updated_at before update on expenses
  for each row execute function app.set_updated_at();
drop trigger if exists revenues_set_updated_at on revenues;
create trigger revenues_set_updated_at before update on revenues
  for each row execute function app.set_updated_at();
drop trigger if exists partners_set_updated_at on partners;
create trigger partners_set_updated_at before update on partners
  for each row execute function app.set_updated_at();
drop trigger if exists partner_agreements_set_updated_at on partner_agreements;
create trigger partner_agreements_set_updated_at before update on partner_agreements
  for each row execute function app.set_updated_at();
drop trigger if exists announcements_set_updated_at on announcements;
create trigger announcements_set_updated_at before update on announcements
  for each row execute function app.set_updated_at();
drop trigger if exists calendar_events_set_updated_at on calendar_events;
create trigger calendar_events_set_updated_at before update on calendar_events
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------- RLS

alter table employees enable row level security;
alter table employees force row level security;
alter table employee_contracts enable row level security;
alter table employee_contracts force row level security;
alter table leave_requests enable row level security;
alter table leave_requests force row level security;
alter table attendance_records enable row level security;
alter table attendance_records force row level security;
alter table financial_categories enable row level security;
alter table financial_categories force row level security;
alter table quotes enable row level security;
alter table quotes force row level security;
alter table quote_items enable row level security;
alter table quote_items force row level security;
alter table invoices enable row level security;
alter table invoices force row level security;
alter table invoice_items enable row level security;
alter table invoice_items force row level security;
alter table payments enable row level security;
alter table payments force row level security;
alter table expenses enable row level security;
alter table expenses force row level security;
alter table revenues enable row level security;
alter table revenues force row level security;
alter table partners enable row level security;
alter table partners force row level security;
alter table partner_contacts enable row level security;
alter table partner_contacts force row level security;
alter table partner_agreements enable row level security;
alter table partner_agreements force row level security;
alter table announcements enable row level security;
alter table announcements force row level security;
alter table calendar_events enable row level security;
alter table calendar_events force row level security;

-- RH : lecture réservée aux détenteurs de la permission hr:read
drop policy if exists employees_select on employees;
create policy employees_select on employees for select
  using (app.has_permission(organization_id, 'hr', 'read') and deleted_at is null);
drop policy if exists employees_insert on employees;
create policy employees_insert on employees for insert
  with check (app.has_permission(organization_id, 'hr', 'create'));
drop policy if exists employees_update on employees;
create policy employees_update on employees for update
  using (app.has_permission(organization_id, 'hr', 'update'))
  with check (app.has_permission(organization_id, 'hr', 'update'));
drop policy if exists employees_delete on employees;
create policy employees_delete on employees for delete
  using (app.has_permission(organization_id, 'hr', 'delete'));

drop policy if exists employee_contracts_select on employee_contracts;
create policy employee_contracts_select on employee_contracts for select
  using (app.has_permission(organization_id, 'hr', 'read'));
drop policy if exists employee_contracts_write on employee_contracts;
create policy employee_contracts_write on employee_contracts for all
  using (app.has_permission(organization_id, 'hr', 'update'))
  with check (app.has_permission(organization_id, 'hr', 'update'));

drop policy if exists leave_requests_select on leave_requests;
create policy leave_requests_select on leave_requests for select
  using (app.has_permission(organization_id, 'hr', 'read'));
drop policy if exists leave_requests_insert on leave_requests;
create policy leave_requests_insert on leave_requests for insert
  with check (app.has_permission(organization_id, 'hr', 'create'));
drop policy if exists leave_requests_update on leave_requests;
create policy leave_requests_update on leave_requests for update
  using (app.has_permission(organization_id, 'hr', 'validate') or app.has_permission(organization_id, 'hr', 'update'))
  with check (app.has_permission(organization_id, 'hr', 'validate') or app.has_permission(organization_id, 'hr', 'update'));

drop policy if exists attendance_records_select on attendance_records;
create policy attendance_records_select on attendance_records for select
  using (app.has_permission(organization_id, 'hr', 'read'));
drop policy if exists attendance_records_write on attendance_records;
create policy attendance_records_write on attendance_records for all
  using (app.has_permission(organization_id, 'hr', 'update'))
  with check (app.has_permission(organization_id, 'hr', 'update'));

-- Finances
drop policy if exists financial_categories_select on financial_categories;
create policy financial_categories_select on financial_categories for select
  using (app.has_permission(organization_id, 'finance', 'read'));
drop policy if exists financial_categories_write on financial_categories;
create policy financial_categories_write on financial_categories for all
  using (app.has_permission(organization_id, 'finance', 'update'))
  with check (app.has_permission(organization_id, 'finance', 'update'));

drop policy if exists quotes_select on quotes;
create policy quotes_select on quotes for select
  using (app.has_permission(organization_id, 'finance', 'read') and deleted_at is null);
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
  using (exists (select 1 from quotes q where q.id = quote_id and app.has_permission(q.organization_id, 'finance', 'read')));
drop policy if exists quote_items_write on quote_items;
create policy quote_items_write on quote_items for all
  using (exists (select 1 from quotes q where q.id = quote_id and app.has_permission(q.organization_id, 'finance', 'update')))
  with check (exists (select 1 from quotes q where q.id = quote_id and app.has_permission(q.organization_id, 'finance', 'update')));

drop policy if exists invoices_select on invoices;
create policy invoices_select on invoices for select
  using (app.has_permission(organization_id, 'finance', 'read') and deleted_at is null);
drop policy if exists invoices_insert on invoices;
create policy invoices_insert on invoices for insert
  with check (app.has_permission(organization_id, 'finance', 'create'));
drop policy if exists invoices_update on invoices;
create policy invoices_update on invoices for update
  using (app.has_permission(organization_id, 'finance', 'update') or app.has_permission(organization_id, 'finance', 'validate'))
  with check (app.has_permission(organization_id, 'finance', 'update') or app.has_permission(organization_id, 'finance', 'validate'));
drop policy if exists invoices_delete on invoices;
create policy invoices_delete on invoices for delete
  using (app.has_permission(organization_id, 'finance', 'delete'));

drop policy if exists invoice_items_select on invoice_items;
create policy invoice_items_select on invoice_items for select
  using (exists (select 1 from invoices i where i.id = invoice_id and app.has_permission(i.organization_id, 'finance', 'read')));
drop policy if exists invoice_items_write on invoice_items;
create policy invoice_items_write on invoice_items for all
  using (exists (select 1 from invoices i where i.id = invoice_id and app.has_permission(i.organization_id, 'finance', 'update')))
  with check (exists (select 1 from invoices i where i.id = invoice_id and app.has_permission(i.organization_id, 'finance', 'update')));

drop policy if exists payments_select on payments;
create policy payments_select on payments for select
  using (app.has_permission(organization_id, 'finance', 'read'));
drop policy if exists payments_insert on payments;
create policy payments_insert on payments for insert
  with check (app.has_permission(organization_id, 'finance', 'create'));
drop policy if exists payments_delete on payments;
create policy payments_delete on payments for delete
  using (app.has_permission(organization_id, 'finance', 'delete'));

drop policy if exists expenses_select on expenses;
create policy expenses_select on expenses for select
  using (app.has_permission(organization_id, 'finance', 'read') and deleted_at is null);
drop policy if exists expenses_insert on expenses;
create policy expenses_insert on expenses for insert
  with check (app.has_permission(organization_id, 'finance', 'create'));
drop policy if exists expenses_update on expenses;
create policy expenses_update on expenses for update
  using (app.has_permission(organization_id, 'finance', 'update') or app.has_permission(organization_id, 'finance', 'validate'))
  with check (app.has_permission(organization_id, 'finance', 'update') or app.has_permission(organization_id, 'finance', 'validate'));
drop policy if exists expenses_delete on expenses;
create policy expenses_delete on expenses for delete
  using (app.has_permission(organization_id, 'finance', 'delete'));

drop policy if exists revenues_select on revenues;
create policy revenues_select on revenues for select
  using (app.has_permission(organization_id, 'finance', 'read') and deleted_at is null);
drop policy if exists revenues_insert on revenues;
create policy revenues_insert on revenues for insert
  with check (app.has_permission(organization_id, 'finance', 'create'));
drop policy if exists revenues_update on revenues;
create policy revenues_update on revenues for update
  using (app.has_permission(organization_id, 'finance', 'update'))
  with check (app.has_permission(organization_id, 'finance', 'update'));
drop policy if exists revenues_delete on revenues;
create policy revenues_delete on revenues for delete
  using (app.has_permission(organization_id, 'finance', 'delete'));

-- Partenaires
drop policy if exists partners_select on partners;
create policy partners_select on partners for select
  using (app.is_member(organization_id) and deleted_at is null);
drop policy if exists partners_insert on partners;
create policy partners_insert on partners for insert
  with check (app.has_permission(organization_id, 'partners', 'create'));
drop policy if exists partners_update on partners;
create policy partners_update on partners for update
  using (app.has_permission(organization_id, 'partners', 'update'))
  with check (app.has_permission(organization_id, 'partners', 'update'));
drop policy if exists partners_delete on partners;
create policy partners_delete on partners for delete
  using (app.has_permission(organization_id, 'partners', 'delete'));

drop policy if exists partner_contacts_select on partner_contacts;
create policy partner_contacts_select on partner_contacts for select
  using (app.is_member(organization_id));
drop policy if exists partner_contacts_write on partner_contacts;
create policy partner_contacts_write on partner_contacts for all
  using (app.has_permission(organization_id, 'partners', 'update'))
  with check (app.has_permission(organization_id, 'partners', 'update'));

drop policy if exists partner_agreements_select on partner_agreements;
create policy partner_agreements_select on partner_agreements for select
  using (app.is_member(organization_id));
drop policy if exists partner_agreements_write on partner_agreements;
create policy partner_agreements_write on partner_agreements for all
  using (app.has_permission(organization_id, 'partners', 'update'))
  with check (app.has_permission(organization_id, 'partners', 'update'));

-- Communication
drop policy if exists announcements_select on announcements;
create policy announcements_select on announcements for select
  using (app.is_member(organization_id) and deleted_at is null);
drop policy if exists announcements_write on announcements;
create policy announcements_write on announcements for all
  using (app.has_permission(organization_id, 'communication', 'update'))
  with check (app.has_permission(organization_id, 'communication', 'update'));

drop policy if exists calendar_events_select on calendar_events;
create policy calendar_events_select on calendar_events for select
  using (
    app.is_member(organization_id) and deleted_at is null and (
      visibility = 'organization'
      or created_by = app.current_user_id()
      or (visibility = 'department' and exists (
        select 1 from organization_members m
        where m.organization_id = calendar_events.organization_id
          and m.user_id = app.current_user_id()
          and m.department_id = calendar_events.department_id
      ))
    )
  );
drop policy if exists calendar_events_insert on calendar_events;
create policy calendar_events_insert on calendar_events for insert
  with check (app.has_permission(organization_id, 'communication', 'create') and created_by = app.current_user_id());
drop policy if exists calendar_events_update on calendar_events;
create policy calendar_events_update on calendar_events for update
  using (created_by = app.current_user_id() or app.has_permission(organization_id, 'communication', 'update'))
  with check (created_by = app.current_user_id() or app.has_permission(organization_id, 'communication', 'update'));
drop policy if exists calendar_events_delete on calendar_events;
create policy calendar_events_delete on calendar_events for delete
  using (created_by = app.current_user_id() or app.has_permission(organization_id, 'communication', 'delete'));

grant select, insert, update, delete on all tables in schema public to organix_app;
grant execute on all functions in schema app to organix_app;
