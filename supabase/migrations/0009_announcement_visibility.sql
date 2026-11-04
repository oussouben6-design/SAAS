-- 0009 : visibilité des annonces par audience
--
-- Une annonce peut cibler toute l'organisation, un département ou les administrateurs.
-- Le filtrage est appliqué par RLS (et non seulement par l'interface) : un collaborateur
-- ne peut pas lire une annonce qui ne le concerne pas, même par une requête directe.
--
-- Le filtre `deleted_at` reste volontairement absent des politiques SELECT
-- (voir 0008) : les requêtes métier excluent les annonces archivées.

drop policy if exists announcements_select on announcements;
create policy announcements_select on announcements for select
  using (
    app.is_member(organization_id) and (
      audience = 'all'
      or (audience = 'admins' and app.has_permission(organization_id, 'organization', 'administer'))
      or (audience = 'department' and exists (
        select 1
        from organization_members m
        where m.organization_id = announcements.organization_id
          and m.user_id = app.current_user_id()
          and m.department_id = announcements.department_id
      ))
    )
  );
