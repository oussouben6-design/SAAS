-- =====================================================================
-- 0021 — Les politiques d'insertion ne doivent autoriser QUE l'insertion
--
-- Constat de l'audit (`npm run db:audit`) : dans les migrations 0001 à 0010, chaque politique
-- nommée `*_insert` est écrite `for all` avec une seule clause `WITH CHECK`. Or une politique
-- permissive `FOR ALL` s'applique **aussi aux SELECT**, avec `USING` implicite `true` ; elle est
-- ajoutée par OR au filtre de `*_select`. Dès qu'un rôle obtient le privilège SELECT sur la table
-- (par exemple `authenticated` sur Supabase,cf. 0013/0020), il lit **toutes les lignes de toutes
-- les organisations**. C'est exactement le chemin d'exposition observé en production le
-- 7 novembre 2026 — la fuite ne venait pas que de la dérive.
--
-- Cette migration reconstruit automatiquement toute politique concernée en `for insert`
-- (avec le même `WITH CHECK`) : le contrôle d'insertion est conservé à l'identique, la porte
-- laissée ouverte au SELECT est fermée. Idempotente et défensive : elle corrigera d'office toute
-- rechute, y compris sur une base déjà migrée.
-- =====================================================================

do $fix$
declare
  pol record;
  v_checked text;
begin
  for pol in
    select n.nspname as nsp, c.relname as rel, p.polname as name,
           pg_get_expr(p.polwithcheck, p.polrelid) as checked
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and p.polcmd = 'a'
      and p.polqual is null
      and p.polwithcheck is not null
      and c.relkind = 'r'
    order by 1, 2, 3
  loop
    v_checked := pol.checked;
    if v_checked is null then
      continue; -- politique sans contrôle : rien à reconstruire.
    end if;
    execute format('drop policy if exists %I on %I.%I', pol.name, pol.nsp, pol.rel);
    execute format(
      'create policy %I on %I.%I for insert with check (%s)',
      pol.name, pol.nsp, pol.rel, v_checked
    );
    raise notice 'Politique % sur %.% reconstruite en FOR INSERT', pol.name, pol.nsp, pol.rel;
  end loop;
end
$fix$;
