-- =====================================================================
-- 0017 — Totaux financiers recalculés en base + notifications temps réel
-- (RÉCUPÉRATION de dérive, 7 novembre 2026 — appliquée à 21:14 UTC, jamais versionnée)
--
-- Cinq fonctions de déclencheur maintiennent les totaux et le statut payé depuis la base,
-- deux déclencheurs de notification, et l'ajout de `notifications` à la publication
-- `supabase_realtime`. Les ACL sont reproduites telles quelles (exécutables par le
-- propriétaire et `service_role` uniquement).
-- =====================================================================

-- ---------------------------------------------------------------- totaux facture / devis

create or replace function public.invoice_before_set_totals() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'INSERT'
     or new.subtotal_minor is distinct from old.subtotal_minor
     or new.tax_rate is distinct from old.tax_rate then
    new.tax_minor := round(new.subtotal_minor * coalesce(new.tax_rate, 0) / 100.0)::bigint;
    new.total_minor := new.subtotal_minor + new.tax_minor;
  end if;
  return new;
end;
$fn$;

create or replace function public.quote_before_set_totals() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'INSERT'
     or new.subtotal_minor is distinct from old.subtotal_minor
     or new.tax_rate is distinct from old.tax_rate then
    new.total_minor := new.subtotal_minor + round(new.subtotal_minor * coalesce(new.tax_rate, 0) / 100.0)::bigint;
  end if;
  return new;
end;
$fn$;

create or replace function public.invoice_items_recalc_totals() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  inv uuid;
  sub bigint;
  rate numeric;
  tax bigint;
begin
  inv := coalesce(new.invoice_id, old.invoice_id);
  select coalesce(sum(amount_minor), 0) into sub from invoice_items where invoice_id = inv;
  select tax_rate into rate from invoices where id = inv;
  tax := round(sub * coalesce(rate, 0) / 100.0)::bigint;
  update invoices set subtotal_minor = sub, tax_minor = tax, total_minor = sub + tax where id = inv;
  return null;
end;
$fn$;

create or replace function public.quote_items_recalc_totals() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  qid uuid;
  sub bigint;
  rate numeric;
begin
  qid := coalesce(new.quote_id, old.quote_id);
  select coalesce(sum(amount_minor), 0) into sub from quote_items where quote_id = qid;
  select tax_rate into rate from quotes where id = qid;
  update quotes set subtotal_minor = sub, total_minor = sub + round(sub * coalesce(rate, 0) / 100.0)::bigint where id = qid;
  return null;
end;
$fn$;

create or replace function public.payments_recalc_paid() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  inv uuid;
  paid bigint;
begin
  inv := coalesce(new.invoice_id, old.invoice_id);
  select coalesce(sum(amount_minor), 0) into paid from payments where invoice_id = inv;
  update invoices set
    amount_paid_minor = paid,
    status = case
      when status in ('draft', 'cancelled') then status
      when paid >= total_minor and total_minor > 0 then 'paid'
      when paid > 0 then 'partial'
      when status in ('paid', 'partial') then 'sent'
      else status
    end
  where id = inv;
  return null;
end;
$fn$;

drop trigger if exists invoices_set_totals on invoices;
create trigger invoices_set_totals before insert or update on invoices
  for each row execute function public.invoice_before_set_totals();

drop trigger if exists quotes_set_totals on quotes;
create trigger quotes_set_totals before insert or update on quotes
  for each row execute function public.quote_before_set_totals();

drop trigger if exists invoice_items_recalc on invoice_items;
create trigger invoice_items_recalc after insert or delete or update on invoice_items
  for each row execute function public.invoice_items_recalc_totals();

drop trigger if exists quote_items_recalc on quote_items;
create trigger quote_items_recalc after insert or delete or update on quote_items
  for each row execute function public.quote_items_recalc_totals();

drop trigger if exists payments_recalc on payments;
create trigger payments_recalc after insert or delete or update on payments
  for each row execute function public.payments_recalc_paid();

do $acl$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke execute on function public.invoice_before_set_totals() from public';
    execute 'revoke execute on function public.quote_before_set_totals() from public';
    execute 'revoke execute on function public.invoice_items_recalc_totals() from public';
    execute 'revoke execute on function public.quote_items_recalc_totals() from public';
    execute 'revoke execute on function public.payments_recalc_paid() from public';
    execute 'grant execute on function public.invoice_before_set_totals() to service_role';
    execute 'grant execute on function public.quote_before_set_totals() to service_role';
    execute 'grant execute on function public.invoice_items_recalc_totals() to service_role';
    execute 'grant execute on function public.quote_items_recalc_totals() to service_role';
    execute 'grant execute on function public.payments_recalc_paid() to service_role';
  end if;
end
$acl$;

-- ---------------------------------------------------------------- notifications (dépendent de auth.uid())

do $notif$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'uid'
  ) then
    raise notice 'fonction auth.uid() absente : déclencheurs de notification ignorés';
    return;
  end if;

  create or replace function public.notify_task_assigned() returns trigger
  language plpgsql security definer set search_path = public, pg_temp
  as $fn$
  begin
    if new.assignee_id is null then return null; end if;
    if tg_op = 'UPDATE' and old.assignee_id is not distinct from new.assignee_id then return null; end if;
    if new.assignee_id = coalesce(auth.uid(), '00000000-0000-4000-8000-000000000000'::uuid) then return null; end if;
    insert into notifications (organization_id, user_id, type, title, body, link)
    values (new.organization_id, new.assignee_id, 'task', 'Nouvelle tâche assignée', new.title, '/taches');
    return null;
  end;
  $fn$;

  create or replace function public.notify_leave_decided() returns trigger
  language plpgsql security definer set search_path = public, pg_temp
  as $fn$
  declare
    target_user uuid;
    decision_label text;
  begin
    if new.status not in ('approved', 'rejected') then return null; end if;
    if tg_op = 'UPDATE' and old.status is not distinct from new.status then return null; end if;
    select user_id into target_user from employees where id = new.employee_id;
    if target_user is null then return null; end if;
    if target_user = coalesce(auth.uid(), '00000000-0000-4000-8000-000000000000'::uuid) then return null; end if;
    decision_label := case when new.status = 'approved' then 'approuvée' else 'rejetée' end;
    insert into notifications (organization_id, user_id, type, title, body, link)
    values (new.organization_id, target_user, 'leave', 'Demande de congé ' || decision_label,
            'Votre demande de congé du ' || new.start_date || ' au ' || new.end_date || ' a été ' || decision_label || '.', '/conges');
    return null;
  end;
  $fn$;

  drop trigger if exists tasks_notify_assigned on tasks;
  create trigger tasks_notify_assigned after insert or update of assignee_id on tasks
    for each row execute function public.notify_task_assigned();

  drop trigger if exists leave_requests_notify_decided on leave_requests;
  create trigger leave_requests_notify_decided after insert or update of status on leave_requests
    for each row execute function public.notify_leave_decided();

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke execute on function public.notify_task_assigned() from public';
    execute 'revoke execute on function public.notify_leave_decided() from public';
    execute 'grant execute on function public.notify_task_assigned() to service_role';
    execute 'grant execute on function public.notify_leave_decided() to service_role';
  end if;
end
$notif$;

-- ---------------------------------------------------------------- temps réel (Supabase uniquement)

do $rt$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables where pubname = 'supabase_realtime'
         and schemaname = 'public' and tablename = 'notifications'
     ) then
    execute 'alter publication supabase_realtime add table public.notifications';
    raise notice 'table public.notifications ajoutée à la publication supabase_realtime';
  else
    raise notice 'publication supabase_realtime absente ou déjà configurée : rien à faire';
  end if;
end
$rt$;
