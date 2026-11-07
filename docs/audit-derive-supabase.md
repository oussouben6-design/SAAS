# Audit de dérive — projet Supabase `opnlvqwbevnivfjpbrxa` (7 novembre 2026)

Cet audit documente un écart constaté entre **la base de données réelle** et **le dépôt**, et la
faille d'isolation inter-organisations qu'il a révélée. Il a été mené en SQL en lecture seule via
l'API de gestion Supabase (aucun accès au mot de passe de la base), puis corrigé côté dépôt.

## 1. Méthode

1. Comparaison objet par objet entre `public`/`app` en base et le résultat d'une base PGlite neuve
   sur laquelle **seules** les migrations du dépôt ont été appliquées (référence).
2. Empreintes (count + md5) sur six familles : tables, colonnes, index, contraintes, politiques RLS,
   déclencheurs, fonctions — plus les ACL (`has_table_privilege`, `has_function_privilege`,
   `pg_policies`, `pg_publication_tables`, `pg_event_trigger`).
3. Lecture des définitions réelles (`pg_get_expr`, `pg_get_triggerdef`, `prosrc`) pour reconstruire
   les objets absents du dépôt.

Comparaison de référence (14 migrations du dépôt) contre production (19 entrées de journal) :

| Famille | Dépôt | Base réelle | Verdict |
| --- | --- | --- | --- |
| Tables (`public`) | 49 | 49 | identique |
| Colonnes | 557 | 557 | identique |
| Index | 120 | 120 | identique |
| Contraintes (hors NOT NULL) | 299 | 299 | identique |
| Colonles NOT NULL | 343 | 343 | identique |
| Politiques RLS | 128 | **133** | 7 en trop, 2 manquantes |
| Déclencheurs | 26 | **33** | 7 en trop |
| Fonctions (`app` + `public`) | 8 | **20** | 12 en trop |
| Journal `app.migrations` | 14 fichiers | **19 entrées** | 5 entrées sans fichier |

Aucune dérive **structurelle** (colonnes/index/contraintes) : l'écart porte sur des objets de
comportement (politiques, déclencheurs, fonctions) et sur les **privilèges**.

## 2. Objet non versionné (5 migrations « fantômes »)

Appliquées le 7 novembre 2026 entre 20:36 et 21:17 UTC, enregistrées dans `app.migrations`,
**jamais commitées** (absentes de `main` comme de toute branche du dépôt) :

| Entrée de journal | Contenu réel |
| --- | --- |
| `0015_supabase_auth_bridge.sql` | `public.handle_new_user()` + déclencheur `on_auth_user_created` sur `auth.users` ; `public.bootstrap_organization(...)` (RPC d'onboarding PostgREST) |
| `0016_member_by_email.sql` | `public.add_organization_member_by_email(...)` (ajout de membre par e-mail, avec contrôle de permission, audit, notification) |
| `0017_finance_items_realtime_notifications.sql` | recalcul des totaux en base (`invoice_before_set_totals`, `quote_before_set_totals`, `invoice_items_recalc_totals`, `quote_items_recalc_totals`, `payments_recalc_paid`) + 5 déclencheurs ; notifications `tasks_notify_assigned`, `leave_requests_notify_decided` ; `notifications` ajoutée à la publication `supabase_realtime` |
| `0018_quote_to_invoice.sql` | `public.convert_quote_to_invoice(...)` (numérotation, recopie des lignes, devis → `accepted`, audit) |
| `0019_item_policies_fines.sql` | remplacement des politiques `invoice_items_write`/`quote_items_write` par 6 politiques granulaires + `payments_update`. Le volet « fines » n'existe pas en base : abandonné avant commit |

Ces objets ont été **reconstruits à l'identique** dans le dépôt (mêmes noms de fichiers, mêmes
définitions, mêmes ACL — sauf celles jugées non défendables, voir § 4) par les migrations `0015` à
`0019`. Un déploiement depuis Git reproduit donc de nouveau la production.

## 3. Faille découverte au passage (la plus importante)

Les migrations `0001` à `0010` définissent chaque politique d'insertion ainsi :

```sql
create policy customers_insert on customers for all
  with check (app.has_permission(organization_id, 'crm', 'create'));
```

Une politique **permissive** `FOR ALL` s'applique aussi aux `SELECT`, avec `USING` implicite
`true`. Les politiques permissives étant combinées par **OR**, `customers_select` (filtrée par
organisation) devient inopérante : **toute ligne de toute organisation est lisible** dès lors que
le rôle qui interroge la table possède le privilège `SELECT`.

En local, le piège est inoffensif car seul `organix_app` touche les tables. Sur Supabase, il suffit
qu'un rôle obtienne ces privilèges pour que l'exposition devienne réelle — et c'était le cas :

* `authenticated` disposait de `SELECT/INSERT/UPDATE/DELETE` sur **43 des 49 tables métier**
  (révocations de `0013` annulées) ; `anon` restait sans privilège de table ;
* `anon` et `authenticated` disposaient de `EXECUTE` sur les fonctions `app.*`
  (`has_permission`, `is_member`, `is_org_admin`, `can_view_profile`, `current_org_member_id`,
  `current_user_id`) ;
* `anon` pouvait exécuter `public.handle_new_user()` et `public.rls_auto_enable()` ;
* les fonctions RPC `public.bootstrap_organization`, `public.add_organization_member_by_email` et
  `public.convert_quote_to_invoice` étaient exécutables par `authenticated` (modèle PostgREST
  assumé par la session qui les a créées — leurs corps contrôlent bien les permissions via
  `app.has_permission` et `auth.uid()`, donc pas d'escalade directe, mais une surface d'appel
  publique).

**Conséquence concrète et vérifiée** : `GET /rest/v1/invoice_items?select=*` et
`GET /rest/v1/quote_items?select=*` (avec le jeton d'accès de n'importe quel utilisateur connecté,
d'une organisation quelconque) renvoient **les lignes de facturation et de devis de toutes les
organisations** — les deux seules tables où la dérive de `0019` ajoutait une politique
`for all` sans `USING` et où le privilège `SELECT` avait été rendu.

Les tables dont `organix_app` est explicitement privé de droits (`user_mfa`, `mfa_challenges`,
`user_identities`) sont un choix assumé : elles ne sont lues que par le service d'authentification,
en mode privilégié. L'audit le vérifie et le documente plutôt que de le « réparer ».

## 4. Corrections apportées au dépôt

| Migration | Effet |
| --- | --- |
| `0015`→`0019` | Récupération à l'identique des objets non versionnés (fonctions, déclencheurs, politiques, publication temps réel). Les ACL sont reproduites, **sauf** `EXECUTE` à `anon` sur `handle_new_user` (révoqué) |
| `0020_rls_insert_leak_fix.sql` | Réécrit `invoice_items_insert` et `quote_items_insert` en `for insert` ; rejoue les révocations de `0013` (tables, séquences, fonctions `app`, privilèges par défaut) ; révoque `EXECUTE` de `handle_new_user` (public) et de `rls_auto_enable` (anon/authenticated) ; programme des **privilèges par défaut** pour `organix_app` afin qu'une table créée par une migration future ne soit plus jamais silencieusement inatteignable |
| `0021_rls_insert_policies_are_insert_only.sql` | Générique : reconstruit **toute** politique permissive `for all` sans `USING` (mais avec `WITH CHECK`) en `for insert`, sur n'importe quelle base déjà migrée. C'est la correction des 26 politiques héritées de `0001`–`0010` |
| `scripts/db-audit.ts` + `npm run db:audit` + `supabase/schema-lock.json` | Garde automatique : dérive du journal de migrations, RLS non forcée, privilèges rendus à `anon`/`authenticated`, fonctions `security definer` exposées à `anon`, politique `for all` sans `USING`, et comparaison d'inventaire au verrou. Étape ajoutée à la CI |

Limite assumée de la garde : PGlite enregistre `polcmd = 'a'` pour **toutes** les politiques, sans
distinguer `FOR INSERT` de `FOR ALL`. Le contrôle des politiques « `for all` sans `USING` » n'est
donc exécuté que contre un vrai PostgreSQL (Supabase) ; sur PGlite il est ignoré avec une note.

## 5. État de la base réelle et action restante

Les correctifs ci-dessus sont **dans le dépôt**, pas encore **dans la base** : aucune écriture n'a
été faite sur `opnlvqwbevnivfjpbrxa` lors de cet audit. À valider puis appliquer, dans cet ordre :

1. **Couper l'exposition** (immédiat, réversible, aucune perte de donnée) : rejouer les révocations
   de `0013` + les 3 politiques concernées en `for insert` ;
2. **Rétablir le versionnement** : appliquer `0015`→`0021` (idempotent par construction) ;
3. **Contrôler** : `npm run db:audit` contre la base de production doit sortir « aucune dérive » ;
4. Décider du modèle : soit **Next.js seul** (révoquer `EXECUTE` aux rôles Supabase sur les trois
   RPC — c'est ce que fait `0020` pour `handle_new_user`, à étendre), soit **RPC PostgREST assumé**
   (dans ce cas, il faut écrire les politiques pour qu'elles lisent `auth.uid()` au lieu de la
   variable `organix.user_id`, sinon ces RPC ne verront jamais l'utilisateur et resteront
   inopérantes — c'est le comportement actuel).

Commandes (avec `DATABASE_URL` du pooler, ou via l'API de gestion) :

```bash
npm run db:migrate     # applique 0015 → 0021 sur la base configurée
npm run db:audit       # attend : « Schéma conforme au dépôt : aucune dérive détectée. »
```

## 6. Ce que l'audit a produit de vérifiable

```
PGlite neuve, 21 migrations                → 49 tables · 133 politiques · 31 déclencheurs · 13 fonctions · 557 colonnes
npm run db:audit (après --update du verrou) → « aucune dérive détectée » (2 notes d'exclusion PGlite)
npm test                                   → 130/130 tests (19 fichiers), aucun échec avec les triggers de recalcul actifs
npx tsc --noEmit · npx eslint .            → 0 erreur
Simulation de dérive (politiques + fonction + 5 entrées de journal ajoutées en base)
                                           → 4 anomalies signalées, code de sortie 1
```
