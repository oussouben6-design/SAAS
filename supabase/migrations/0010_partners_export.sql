-- 0010 : permission d'export des partenaires
--
-- La page Partenaires expose un export CSV (contacts et conventions). L'export de données
-- personnelles nécessite une permission dédiée, comme pour les autres modules exportables.
-- Cette migration ajoute la permission aux organisations existantes et la rattache aux rôles
-- qui peuvent déjà créer/modifier des partenaires. Le catalogue TypeScript et la migration
-- 0006 sont alignés pour les nouvelles installations.

insert into permissions (module, action, description)
values ('partners', 'export', 'Exporter les partenaires')
on conflict (module, action) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.module = 'partners' and p.action = 'export'
where r.key in ('owner', 'director', 'department_manager', 'manager')
on conflict (role_id, permission_id) do nothing;
