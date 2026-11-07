-- =====================================================================
-- 0019 — Politiques RLS granulaires sur les lignes et encaissements
-- (RÉCUPÉRATION de dérive, 7 novembre 2026 — appliquée à 21:17 UTC, jamais versionnée)
--
-- Ce fichier reproduit **tel quel** l'état constaté en production, y compris son défaut :
-- les politiques `*_insert` y ont été créées en `for all` sans clause USING. Combiné au
-- privilège SELECT rendu à `authenticated`, cela exposait toutes les lignes de toutes les
-- organisations via PostgREST. La correction est apportée par `0020_rls_insert_leak_fix.sql`
-- — l'historique reste lisible : 0019 = état constaté, 0020 = réparation.
--
-- L'entrée de journal `0019_item_policies_fines.sql` mentionnait aussi « fines » : aucun objet
-- de ce nom n'existe en base (ni table, ni colonne, ni politique) — la partie a été abandonnée.
-- =====================================================================

drop policy if exists invoice_items_write on invoice_items;
drop policy if exists quote_items_write on quote_items;

drop policy if exists invoice_items_insert on invoice_items;
create policy invoice_items_insert on invoice_items for all
  with check (
    exists (
      select 1 from invoices i
      where i.id = invoice_items.invoice_id
        and app.has_permission(i.organization_id, 'finance', 'create')
    )
  );

drop policy if exists invoice_items_update on invoice_items;
create policy invoice_items_update on invoice_items for update
  using (
    exists (
      select 1 from invoices i
      where i.id = invoice_items.invoice_id
        and app.has_permission(i.organization_id, 'finance', 'update')
    )
  )
  with check (
    exists (
      select 1 from invoices i
      where i.id = invoice_items.invoice_id
        and app.has_permission(i.organization_id, 'finance', 'update')
    )
  );

drop policy if exists invoice_items_delete on invoice_items;
create policy invoice_items_delete on invoice_items for delete
  using (
    exists (
      select 1 from invoices i
      where i.id = invoice_items.invoice_id
        and (app.has_permission(i.organization_id, 'finance', 'delete')
             or app.has_permission(i.organization_id, 'finance', 'update'))
    )
  );

drop policy if exists quote_items_insert on quote_items;
create policy quote_items_insert on quote_items for all
  with check (
    exists (
      select 1 from quotes q
      where q.id = quote_items.quote_id
        and app.has_permission(q.organization_id, 'crm', 'create')
    )
  );

drop policy if exists quote_items_update on quote_items;
create policy quote_items_update on quote_items for update
  using (
    exists (
      select 1 from quotes q
      where q.id = quote_items.quote_id
        and app.has_permission(q.organization_id, 'crm', 'update')
    )
  )
  with check (
    exists (
      select 1 from quotes q
      where q.id = quote_items.quote_id
        and app.has_permission(q.organization_id, 'crm', 'update')
    )
  );

drop policy if exists quote_items_delete on quote_items;
create policy quote_items_delete on quote_items for delete
  using (
    exists (
      select 1 from quotes q
      where q.id = quote_items.quote_id
        and (app.has_permission(q.organization_id, 'crm', 'delete')
             or app.has_permission(q.organization_id, 'crm', 'update'))
    )
  );

drop policy if exists payments_update on payments;
create policy payments_update on payments for update
  using (app.has_permission(organization_id, 'finance', 'update'))
  with check (app.has_permission(organization_id, 'finance', 'update'));
