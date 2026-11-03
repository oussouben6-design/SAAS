# Diagnostic technique, architecture et plan — livrable de cadrage

Document de référence demandé avant toute construction. Il décrit **ce qui a été constaté**, **ce
qui a été décidé**, **ce qui est déjà construit** et **ce qui reste à faire**, sans extrapoler des
fonctionnalités non réalisées.

Date d'établissement : 2 novembre 2026.

---

## 1. Diagnostic technique

### 1.1 État du dépôt à l'ouverture de la mission

- Dépôt Git `SAAS` avec **un seul commit** (`4b65833 Initial commit`), un `README.md` de 7 octets
  (titre seul) et **aucun code applicatif, aucune migration, aucun test, aucune documentation**.
- Aucune configuration de CI, aucune convention établie, aucune dépendance installée.
- Un projet Supabase existe déjà sur le compte du commanditaire (identifié via le connecteur), mais
  **aucune clé n'a été communiquée** : aucune connexion à une base réelle n'a été possible.

### 1.2 Environnement d'exécution de la mission

| Élément | Constat | Conséquence |
| --- | --- | --- |
| Node.js | v22.22.3 | Compatible Next.js 15 et Vitest 3 |
| Accès réseau | npm/pypi/GitHub uniquement ; **aucun accès Supabase, aucun test en ligne** | Base PostgreSQL **embarquée (PGlite)** pour développer et tester réellement |
| Navigateurs Playwright | Non téléchargeables (réseau) | Les parcours E2E sont écrits mais **non exécutables ici** ; tests d'intégration Vitest sur base réelle à la place |
| E-mail | Aucun fournisseur | Transport `console` : les liens sont journalisés côté serveur |

### 1.3 Risques identifiés et traitements retenus

| Risque | Traitement |
| --- | --- |
| Livrer une maquette « qui brille » sans persistance | Interdiction de tout écran sans lecture/écriture réelle ; pages non finies marquées « En développement » |
| Multi-tenant ajouté « après » | `organization_id` + RLS dès la première migration |
| Superutilisateur qui contourne la RLS | Rôle applicatif `organix_app` + `force row level security` sur toutes les tables métier |
| Flottants monétaires | Entiers en unité mineure (`*_minor bigint`) + devise ISO ; formatage centralisé |
| Permissions décoratives | Contrôle côté page, côté Server Action, et en RLS pour RH/finances |
| Dépendance à un service payant | PGlite/PostgreSQL + sessions maison ; aucun service payant souscrit |
| Perte de données au rechargement | Tout passe par PostgreSQL, sessions en base, aucune donnée en mémoire côté client |

---

## 2. Architecture retenue

**Monolithe modulaire** (un déploiement, des modules isolés), Next.js App Router + PostgreSQL.

```
Navigateur
  └─ Next.js (serveur Node)
       ├─ middleware : redirection sur présence de cookie (aucune décision d'autorisation)
       ├─ pages RSC : requirePagePermission(module, action) → contexte (session, membre, permissions)
       ├─ Server Actions : guard() → Zod → service → audit → revalidation
       └─ src/lib/db : transaction SQL, SET LOCAL ROLE organix_app + contexte de session
              └─ PostgreSQL (Supabase ou PGlite) : RLS forcée, schéma public + schéma app (fonctions)
```

Choix structurants :

1. **Une seule vérité SQL** entre développement et production (migrations identiques).
2. **Sessions maison** : pas de service d'authentification externe, pas de coût, contrôle complet ;
   hachage scrypt, jetons hachés, révocation.
3. **Permissions** = 16 modules × 7 actions possibles (61 permissions effectivement activées par module), attribuées aux 6 rôles et modifiables
   par organisation.
4. **Séparation stricte** entre données réelles et démonstration : colonne `organizations.is_demo`,
   bandeau permanent, script dédié, suppression ciblée.

---

## 3. Vérification des dépendances

Toutes les dépendances sont installées en version exacte (`package.json`) et présentes dans
`package-lock.json` ; aucune n'est payante.

| Dépendance | Version | Usage réel | État |
| --- | --- | --- | --- |
| `next` | 15.5.28 | App Router, Server Actions, middleware | Utilisé |
| `react` / `react-dom` | 19.1.10 | Interface | Utilisé |
| `typescript` | 5.9.3 | Typage strict | Utilisé (`npm run typecheck`) |
| `tailwindcss` + `@tailwindcss/postcss` | 4.1.16 | Styles | Utilisé |
| Radix UI (avatar, dialog, dropdown, label, popover, select, separator, slot, switch, tabs, tooltip, checkbox) | 1.x | Primitives accessibles du design system | Utilisé |
| `lucide-react` | 0.548.0 | Icônes | Utilisé |
| `recharts` | 3.10.1 | Graphiques du tableau de bord et des rapports | Utilisé (données réelles) |
| `react-hook-form` + `@hookform/resolvers` | 7.65.0 / 3.10.0 | Formulaires clients | Utilisé |
| `zod` | 3.25.76 | Validation partagée client/serveur | Utilisé |
| `@electric-sql/pglite` | 0.5.14 | PostgreSQL embarqué (dev, tests) | Utilisé |
| `pg` | 8.16.3 | PostgreSQL réseau (production) | Utilisé |
| `date-fns` | 4.1.0 | Formatage de dates | Utilisé |
| `sonner` | 2.0.7 | Notifications d'interface | Utilisé |
| `class-variance-authority`, `clsx`, `tailwind-merge` | — | Variantes de composants | Utilisé |
| `vitest` + Testing Library + `jsdom` | 3.2.7 / 16.x / 27.0.0 | Tests unitaires et d'intégration | Utilisé (47 tests) |
| `@playwright/test` | 1.56.1 | Parcours E2E | **Installé, pas exécuté ici** (navigateurs indisponibles) |
| `eslint` + `eslint-config-next` | 9.38.0 / 15.5.28 | Qualité statique | Utilisé (`npm run lint`) |
| `tsx` | 4.20.6 | Scripts de maintenance | Utilisé |

Absents volontairement : ORM (SQL explicite, plus prévisible avec RLS), bibliothèque d'UI clé en
main (composants écrits et maîtrisés), fournisseur d'authentification externe, SaaS de facturation.

---

## 4. Plan de développement réaliste

| Phase | Contenu | État réel |
| --- | --- | --- |
| **1 — Socle** | Architecture, design system, schéma noyau, rôles/permissions, authentification, onboarding, organisation, équipe, audit | **Réalisée** (vérifiée par tests) |
| **2 — Opérations** | Tableau de bord, CRM, prospection, projets, tâches, documents, rapports, recherche, notifications | **Réalisée** pour l'essentiel (voir `PROJECT_STATUS.md`) |
| **3 — Support** | RH, finances, partenaires, communication | **Réalisé** : écrans, actions, validations, exports (périmètres limités : pas de paie, pas de comptabilité certifiée, pas de messagerie) |
| **4 — Pilotage avancé** | Rapports avancés, assistant IA | Rapports de base réalisés ; IA **non commencée** (accord explicite requis) |
| **5 — SaaS** | Multi-organisations exploité, facturation, quotas, self-service | Schéma prêt ; fonctionnalités SaaS **non commencées** |

Estimation de la suite (à valider avec le commanditaire) :

| Lot | Contenu | Charge indicative |
| --- | --- | --- |
| A | Modules RH (employés, contrats, congés) | 4–6 jours |
| B | Facturation, encaissements, dépenses, devis | 5–7 jours |
| C | Partenaires + communication interne + calendrier | 3–4 jours |
| D | Transport d'e-mail réel + vérification | 1–2 jours |
| E | Stockage objet (S3/Supabase Storage) | 1–2 jours |
| F | E2E Playwright, CI, supervision | 2–3 jours |
| G | Multi-org / facturation SaaS | 8–12 jours |

Ces estimations supposent un développeur à temps plein, sans changement de périmètre.

---

## 5. Structure de fichiers recommandée

Déjà appliquée (voir `docs/architecture.md` pour l'arborescence détaillée) :

```
src/app/{page,(auth),app,api,invitations,onboarding}   routes
src/modules/<domaine>/{service.ts,actions.ts}          logique métier et mutations
src/lib/{db,auth,permissions,server,validation}        socle technique
src/components/{ui,forms,layout,shared}                design system
supabase/migrations/                                   SQL versionné
tests/{unit,integration,e2e}                           tests
scripts/                                               maintenance (migrate, seed, statut, reset)
docs/                                                  documentation
```

Règle : une page ne contient pas de SQL ; un service ne contient pas de JSX ; une Server Action ne
contient pas de règle métier.

---

## 6. Schéma initial de base de données

**48 tables**, **127 politiques RLS**, 11 migrations idempotentes.

| Domaine | Tables |
| --- | --- |
| Noyau | `profiles`, `organizations`, `departments`, `organization_members`, `roles`, `permissions`, `role_permissions`, `member_roles`, `organization_modules`, `audit_logs`, `notifications` |
| Authentification (accès privilégié seulement) | `user_credentials`, `sessions`, `verification_tokens` |
| CRM | `customer_categories`, `customers`, `customer_contacts`, `customer_interactions` |
| Prospection | `leads`, `pipeline_stages`, `opportunities`, `sales_activities` |
| Projets / tâches | `projects`, `project_members`, `project_milestones`, `tasks`, `task_comments` |
| Documents | `document_folders`, `documents` |
| RH | `employees`, `employee_contracts`, `leave_requests`, `attendance_records` |
| Finances | `financial_categories`, `quotes`, `quote_items`, `invoices`, `invoice_items`, `payments`, `expenses`, `revenues` |
| Partenaires | `partners`, `partner_contacts`, `partner_agreements` |
| Communication | `announcements`, `calendar_events` |

Conventions : clés primaires `uuid`, `organization_id` sur toutes les tables métier, horodatages
`created_at`/`updated_at`, suppression logique `deleted_at`, montants `*_minor bigint` + devise
`char(3)`, contraintes `check` sur les statuts, index partiels sur les lignes actives, trigger
`app.set_updated_at()`.

Fonctions clés : `app.is_member(org)`, `app.has_permission(org, module, action)`,
`app.current_org_id()`, `app.current_user_id()` — définies dans le schéma `app`, exécutables par le
rôle `organix_app`.

Le schéma est **prêt** pour les modules RH/finances/partenaires/communication : les tables existent,
avec leurs politiques. Il manque l'interface, pas la structure.

---

## 7. Services gratuits nécessaires

| Service | Rôle | Nécessaire maintenant ? |
| --- | --- | --- |
| **Supabase** (Free) | PostgreSQL managé + sauvegardes (limitées) | Oui, pour la production |
| **PGlite** (open source, local) | Base de développement et de test | Oui, déjà en place — aucun compte |
| **Vercel / Render / VPS** | Hébergement Node | Oui pour publier (offre gratuite possible avec limites) |
| **GitHub** | Dépôt, CI, revue | Oui (déjà utilisé) |
| **Resend / Brevo** (free) | E-mails transactionnels | Oui pour des invitations autonomes (non branché) |
| **Supabase Storage / S3** | Stockage objet | À prévoir si hébergement sans disque persistant |
| **Sentry** (free) | Suivi d'erreurs | Recommandé, non installé |

Aucun de ces services n'engage de dépense à ce stade.

---

## 8. Coûts anticipés (à valider, aucune dépense engagée)

| Poste | Gratuit | Payant (ordre de grandeur) |
| --- | --- | --- |
| Base de données | Supabase Free : 500 Mo, pause après inactivité, sauvegardes limitées | Supabase Pro ≈ 25 $/mois |
| Hébergement | Render/Vercel free (veille, limites) | VPS 5–20 $/mois |
| Domaine | — | 10–20 $/an |
| E-mails | Resend 3 000/mois | ≈ 20 $/mois au-delà |
| Stockage fichiers | 1 Go (Supabase Storage) | ≈ 0,02 $/Go/mois |
| Assistant IA | — | À chiffrer uniquement sur accord explicite |

Point d'attention : le plan gratuit Supabase met le projet en pause après une période d'inactivité ;
pour un usage quotidien réel, prévoir Supabase Pro ou un PostgreSQL auto-hébergé.

---

## 9. Configurations à réaliser par le commanditaire

1. **Base de production** : créer le projet Supabase (ou un PostgreSQL), fournir `DATABASE_URL`
   (pooler, port 6543), et le mot de passe de la base via un canal sûr.
2. **URL publique** : `APP_URL` (domaine + HTTPS) pour les liens d'e-mail et redirections.
3. **E-mails** : choisir un fournisseur (Resend, Brevo, SMTP interne) ; fournir la clé et
   l'expéditeur, puis valider l'implémentation du transport.
4. **Stockage** : décider entre disque persistant (VPS/Render) ou stockage objet (S3/Supabase).
5. **Hébergement** : choisir la plateforme, fournir l'accès au dépôt et les variables.
6. **Organisation réelle** : nom, raison sociale, secteur, devise, fuseau, départements, catégories.
7. **Comptes** : désigner l'administrateur principal (adresse e-mail), décider si l'inscription
   libre reste ouverte (`AUTH_ALLOW_REGISTRATION`).
8. **Sauvegardes** : valider la rétention souhaitée et la personne responsable des tests de
   restauration.
9. **Assistant IA** : décider explicitement de l'activer ou non (fournisseur, budget, données
   autorisées). Rien n'est envoyé à un tiers aujourd'hui.
10. **Licence** : statuer sur la licence du code (aucune n'est définie actuellement).

Tant que les points 1 et 5 ne sont pas tranchés, l'application fonctionne en mode local
(PGlite) — utilisable pour valider les écrans et les parcours, pas pour un usage réel multi-utilisateur
simultané.
