-- =====================================================================
-- 0018 — Conversion devis → facture en base (RÉCUPÉRATION de dérive, 7 novembre 2026,
-- appliquée à 21:15 UTC, jamais versionnée)
--
-- RPC `convert_quote_to_invoice` : numérotation FAC-AAAA-NNNN par organisation, recopie des
-- lignes, passage du devis à `accepted`, journal d'audit, contrôle « une seule conversion ».
-- Dépend de auth.uid() : sans effet sur PGlite / PostgreSQL sans schéma `auth`.
-- =====================================================================

do $q2i$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'uid'
  ) then
    raise notice 'fonction auth.uid() absente : RPC de conversion devis → facture ignorée';
    return;
  end if;

  create or replace function public.convert_quote_to_invoice(
    p_quote_id uuid,
    p_number text default null,
    p_due_date date default null
  ) returns uuid
  language plpgsql security definer set search_path = public, pg_temp
  as $fn$
  declare
    q quotes%rowtype;
    inv uuid;
    item record;
    num text;
    attempt integer := 0;
    actor uuid := auth.uid();
  begin
    if actor is null then raise exception 'Authentification requise'; end if;

    select * into q from quotes where id = p_quote_id and deleted_at is null;
    if not found then raise exception 'Devis introuvable'; end if;

    if not app.has_permission(q.organization_id, 'crm', 'read') then
      raise exception 'Permission refusée : lecture CRM requise';
    end if;
    if not app.has_permission(q.organization_id, 'finance', 'create') then
      raise exception 'Permission refusée : création finance requise';
    end if;
    if exists (select 1 from invoices where quote_id = q.id and deleted_at is null) then
      raise exception 'Ce devis a déjà été converti en facture';
    end if;

    if p_number is not null and trim(p_number) <> '' then
      num := trim(p_number);
    else
      loop
        attempt := attempt + 1;
        num := 'FAC-' || to_char(now(), 'YYYY') || '-' || lpad(((select count(*) from invoices where organization_id = q.organization_id) + attempt)::text, 4, '0');
        exit when not exists (select 1 from invoices where organization_id = q.organization_id and number = num);
      end loop;
    end if;

    insert into invoices (
      organization_id, number, customer_id, quote_id, status, issue_date, due_date,
      currency, subtotal_minor, tax_rate, notes, terms, created_by
    ) values (
      q.organization_id, num, q.customer_id, q.id, 'draft', current_date,
      coalesce(p_due_date, current_date + 30), q.currency, 0, q.tax_rate, q.notes, q.terms, actor
    ) returning id into inv;

    for item in select * from quote_items where quote_id = q.id order by position, id loop
      insert into invoice_items (invoice_id, description, quantity, unit_price_minor, amount_minor, position)
      values (inv, item.description, item.quantity, item.unit_price_minor, item.amount_minor, item.position);
    end loop;

    update quotes set status = 'accepted' where id = q.id and status <> 'accepted';

    insert into audit_logs (organization_id, actor_id, actor_email, action, entity_type, entity_id, summary)
    values (q.organization_id, actor, (select email from profiles where id = actor),
            'quotes.converted', 'Facture', inv, 'Devis ' || q.number || ' converti en facture ' || num);

    return inv;
  end;
  $fn$;

  revoke execute on function public.convert_quote_to_invoice(uuid, text, date) from public;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.convert_quote_to_invoice(uuid, text, date) to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.convert_quote_to_invoice(uuid, text, date) to authenticated;
  end if;
end
$q2i$;
