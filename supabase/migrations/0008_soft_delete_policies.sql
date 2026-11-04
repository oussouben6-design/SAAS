-- 0008 : suppression logique et politiques SELECT
--
-- Constat vérifié par test (PostgreSQL 16 / PGlite) : une politique SELECT qui
-- filtre `deleted_at is null` empêche la suppression logique elle-même.
-- PostgreSQL évalue la politique SELECT sur la *nouvelle* version de la ligne
-- lors d'un UPDATE : dès que `deleted_at` devient non nul, la ligne n'est plus
-- visible et l'UPDATE est rejeté
-- (« new row violates row-level security policy »).
--
-- Le filtre `deleted_at` est donc retiré des politiques SELECT. L'isolation entre
-- organisations et les permissions restent garanties par RLS ; l'exclusion des
-- enregistrements archivés est assurée par les requêtes métier (`deleted_at is
-- null`), couvertes par les tests d'intégration (archivage vérifié par module).
--
-- Les politiques INSERT/UPDATE/DELETE ne sont pas modifiées.

-- Organisations
drop policy if exists organizations_select on organizations;
create policy organizations_select on organizations for select
  using (app.is_member(id));

-- CRM
drop policy if exists customers_select on customers;
create policy customers_select on customers for select
  using (app.is_member(organization_id));

drop policy if exists customer_contacts_select on customer_contacts;
create policy customer_contacts_select on customer_contacts for select
  using (app.is_member(organization_id));

drop policy if exists leads_select on leads;
create policy leads_select on leads for select
  using (app.is_member(organization_id));

drop policy if exists opportunities_select on opportunities;
create policy opportunities_select on opportunities for select
  using (app.is_member(organization_id));

-- Projets et tâches
drop policy if exists projects_select on projects;
create policy projects_select on projects for select
  using (app.is_member(organization_id));

drop policy if exists tasks_select on tasks;
create policy tasks_select on tasks for select
  using (app.is_member(organization_id));

-- Documents
drop policy if exists documents_select on documents;
create policy documents_select on documents for select
  using (app.is_member(organization_id));

-- RH
drop policy if exists employees_select on employees;
create policy employees_select on employees for select
  using (app.has_permission(organization_id, 'hr', 'read'));

-- Finances
drop policy if exists quotes_select on quotes;
create policy quotes_select on quotes for select
  using (app.has_permission(organization_id, 'finance', 'read'));

drop policy if exists invoices_select on invoices;
create policy invoices_select on invoices for select
  using (app.has_permission(organization_id, 'finance', 'read'));

drop policy if exists expenses_select on expenses;
create policy expenses_select on expenses for select
  using (app.has_permission(organization_id, 'finance', 'read'));

drop policy if exists revenues_select on revenues;
create policy revenues_select on revenues for select
  using (app.has_permission(organization_id, 'finance', 'read'));

-- Partenaires et communication
drop policy if exists partners_select on partners;
create policy partners_select on partners for select
  using (app.is_member(organization_id));

drop policy if exists announcements_select on announcements;
create policy announcements_select on announcements for select
  using (app.is_member(organization_id));

drop policy if exists calendar_events_select on calendar_events;
create policy calendar_events_select on calendar_events for select
  using (
    app.is_member(organization_id) and (
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

-- Index partiels pour les listes filtrées sur les enregistrements actifs.
create index if not exists customers_active_idx on customers (organization_id) where deleted_at is null;
create index if not exists projects_active_idx on projects (organization_id) where deleted_at is null;
create index if not exists tasks_active_idx on tasks (organization_id) where deleted_at is null;
create index if not exists documents_active_idx on documents (organization_id) where deleted_at is null;
create index if not exists partners_active_idx on partners (organization_id) where deleted_at is null;
create index if not exists announcements_active_idx on announcements (organization_id) where deleted_at is null;
create index if not exists calendar_events_active_idx on calendar_events (organization_id) where deleted_at is null;
