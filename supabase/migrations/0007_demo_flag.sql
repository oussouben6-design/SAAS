-- ORGANIX — Migration 0007 : séparation explicite des données de démonstration
--
-- Une organisation marquée `is_demo = true` contient uniquement des données fictives
-- créées par `npm run db:seed`. L'interface affiche un bandeau permanent et les exports
-- rappellent cette origine. Une organisation réelle n'est jamais marquée.

alter table organizations add column if not exists is_demo boolean not null default false;

comment on column organizations.is_demo is
  'Organisation de démonstration : données fictives, créées par scripts/seed.ts, jamais présentées comme réelles.';

create index if not exists organizations_demo_idx on organizations (is_demo) where is_demo;
