# Architecture

## Principes

1. **Monolithe modulaire** : un seul déploiement, des modules découpés par domaine métier. Chaque
   module possède ses services (accès données + règles) et ses Server Actions (mutations) ; les
   pages ne parlent jamais directement à la base.
2. **La base est la dernière ligne de défense** : la RLS est activée *et forcée* sur toutes les
   tables métier, et les requêtes applicatives utilisent un rôle `organix_app` non-superutilisateur.
   Une erreur de code ne peut pas provoquer de fuite entre organisations.
3. **Une seule source de vérité SQL** : les migrations `supabase/migrations/*.sql` s'appliquent à
   l'identique sur PostgreSQL réseau (Supabase, VPS) et sur PGlite (développement, tests).
4. **Aucune fonctionnalité factice** : une page qui ne lit pas de données réelles est marquée
   « En développement » et n'affiche ni chiffre ni graphique inventés.

## Structure des fichiers

```
src/
  app/
    page.tsx                    page publique (état réel des modules)
    (auth)/                     connexion, inscription, mot de passe oublié/réinitialisation, vérification e-mail
    invitations/[token]/        acceptation d'une invitation
    onboarding/                 création de l'organisation (rôles, pipeline, catégories, modules)
    app/                        espace authentifié (layout = coquille + navigation filtrée par permissions)
      clients/ prospection/ projets/ taches/ documents/ rapports/
      parametres/{organisation,equipe,roles,modules,profil}/
      journal/ notifications/ recherche/ acces-refuse/
      rh/ finances/ partenaires/ communication/ assistant/   ← « En développement »
    api/
      documents/[id]/route.ts   téléchargement contrôlé (permission + appartenance)
      organisations/activer/    changement d'organisation active (cookie)
  modules/<domaine>/
    service.ts                  lecture/écriture, règles métier, transactions
    actions.ts                  Server Actions (« use server ») : Zod + guard() + audit
  lib/
    db/                         client PGlite/PostgreSQL, sessions SQL (asUser/asMember/privileged), runner de migrations
    auth/                       scrypt, jetons, sessions, cookies, service d'authentification
    permissions/                catalogue (16 modules × 7 actions), rôles par défaut, libellés
    server/                     contexte de requête, erreurs typées, audit, enveloppe guard()
    validation/                 schémas Zod partagés (auth, organisation, CRM, projets, commun)
    storage.ts mail.ts csv.ts rate-limit.ts utils.ts navigation.ts
  components/
    ui/                         design system (boutons, cartes, dialogues, tableaux, badges…)
    forms/                      formulaires réutilisables (dialogue, formulaire en ligne, confirmation)
    layout/                     coquille authentifiée, barre latérale, écrans d'authentification
    shared/                     filtres, page « module en développement »
tests/
  unit/                         permissions, validation, composants (RTL/jsdom)
  integration/                  base PGlite réelle : sécurité/RLS, authentification, parcours métier
supabase/migrations/            0001 → 0007 (socle, CRM, projets/tâches, documents, RH/finances/partenaires, permissions, drapeau démo)
scripts/                        migrate, db-status, seed, reset-dev-db
```

## Flux d'une requête

```
Navigateur → middleware (présence du cookie) → page (Server Component)
   requirePagePermission(module, action)
     → requireContext() : session en base → membre actif → permissions effectives
   service du module → asMember({userId, organizationId})
     → transaction SQL : SET LOCAL ROLE organix_app + variables de session
     → RLS filtre les lignes (organisation, permissions sensibles)
   rendu HTML (aucune donnée envoyée au client si l'accès est refusé)
```

Une mutation suit le même chemin puis :

```
Server Action → guard(async () => { requirePermission(...) ; zod.parse(...) ; service(...) })
   service : BEGIN → update/insert → recordAudit(...) → COMMIT
   retour ActionResult { ok, message, fieldErrors }
```

## Conventions

- **Tables** : `id uuid`, `organization_id uuid not null` (tables métier), `created_at`,
  `updated_at`, `deleted_at` (suppression logique), index partiels `where deleted_at is null`.
- **Argent** : `*_minor bigint` + `currency char(3)`. Aucun `float`/`double`. Conversion et
  formatage dans `src/lib/utils.ts` (`parseMoneyToMinor`, `formatMoney`).
- **Statuts** : contraintes `check` en base (voir `PROJECT_STATUS.md` pour la liste).
- **Erreurs** : `AppError(code, message)` → `guard()` renvoie un `ActionResult` sans détail interne.
- **Audit** : chaque mutation appelle `recordAudit` dans la même transaction (action, entité,
  résumé, métadonnées, acteur).
- **Nommage** : identifiants et clés techniques en anglais, interface et messages en français.

## Multi-organisation

Le schéma est prêt pour le multi-tenant : `organization_id` sur toutes les tables métier, RLS par
organisation, `listMemberships` + cookie `organix_org` pour l'organisation active, et
`/api/organisations/activer` pour en changer. L'interface n'expose aujourd'hui le sélecteur que si
l'utilisateur appartient à plusieurs organisations. La facturation SaaS (plans, quotas) n'est pas
développée : c'est l'objet de la phase 5.

## Décisions techniques notables

| Décision | Raison |
| --- | --- |
| PGlite par défaut | Développement et tests sans service externe, mêmes requêtes SQL |
| Sessions maison (pas de fournisseur d'auth externe) | Contrôle total, aucun coût, aucune dépendance payante |
| Rôle `organix_app` + `force row level security` | Un superutilisateur contourne la RLS ; ce rôle garantit que les politiques s'appliquent |
| Server Actions plutôt qu'API REST générique | Moins de surface, validation centralisée, pas de duplication |
| Mises à jour optimistes limitées, revalidation serveur | Simplicité et cohérence des données |
| Stockage local des fichiers | Zéro dépendance ; interface `StorageDriver` pour brancher S3/Supabase ensuite |
