# Excellence 360 CRM

![Logo Excellence 360 CRM — Excellence Services](public/logo-excellence360.jpg)

**Excellence 360 CRM**, par **Excellence Services** — plateforme intégrée de gestion, de relation
client et de pilotage de la performance : clients, prospection, projets, tâches, documents,
finances, ressources humaines, partenaires, communication interne, collaborateurs, rôles et
permissions, rapports et journal d'audit. *Diagnostic en quelques minutes.*

> **État réel du produit.** Tous les modules métier sont **fonctionnels et persistants**
> (PostgreSQL) : tableau de bord, clients, prospection, projets, tâches, documents, rapports,
> finances (factures, devis, encaissements, dépenses), ressources humaines (dossiers, contrats,
> congés, présences — **sans paie**), partenaires (contacts, conventions), communication (annonces,
> calendrier), paramètres, journal d'audit, notifications et recherche. Périmètres limités et
> limites techniques détaillés dans [`PROJECT_STATUS.md`](./PROJECT_STATUS.md).
> L'**assistant IA** reste volontairement non implémenté (aucun appel externe).

## Démarrage rapide (5 minutes)

Prérequis : Node.js ≥ 20.9 (testé avec Node 22), npm ≥ 10. Aucun service externe n'est nécessaire
en développement : la base PostgreSQL embarquée **PGlite** (WASM) est utilisée par défaut.

```bash
git clone <votre-dépôt> organix && cd organix
npm install
cp .env.example .env.local          # Windows : copy .env.example .env.local
npm run db:migrate                  # crée le schéma (13 migrations, idempotentes)
npm run db:seed                     # jeu de DÉMONSTRATION (fictif, clairement identifié)
npm run dev                         # http://localhost:3000
```

Le script de démonstration affiche à la fin les comptes créés (un par rôle) et un mot de passe
généré. L'organisation porte `is_demo = true` : un bandeau permanent rappelle que les données sont
fictives.

Pour créer votre véritable espace : ouvrez `/inscription`, créez votre compte, complétez
l'onboarding (nom, secteur, devise, fuseau, départements). Cet espace **n'est pas** marqué comme
démonstration et aucun jeu de données fictif n'y est injecté.

## Scripts npm

| Script | Effet |
| --- | --- |
| `npm run dev` | Serveur de développement (0.0.0.0:3000) |
| `npm run build` / `npm start` | Build de production et démarrage |
| `npm run lint` | ESLint (aucun avertissement toléré) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` / `npm run test:watch` | Tests Vitest (unitaires + intégration base réelle) |
| `npm run test:e2e` | Tests Playwright (nécessite un navigateur installé) |
| CI | `.github/workflows/ci.yml` : types, lint, tests et build à chaque push |
| `npm run db:migrate` | Applique les migrations et affiche leur état |
| `GET /api/health` | Sonde de disponibilité (base, migrations, latence) — sans donnée métier |
| `npm run db:status` | Moteur, migrations, volumétrie, organisations de démonstration |
| `npm run db:seed` | Crée le jeu de démonstration (`-- --force` pour le recréer) |
| `npm run admin:create` | Crée un **compte réel** + son organisation (`-- --email … --name … --org …`) |
| `npm run db:backup` | Sauvegarde vérifiable (copie + manifeste + empreintes ; `--verifier` ouvre la copie) |
| `npm run db:restore` | Restauration contrôlée (`--depuis <dossier> --yes --force`) |
| `npm run db:maintenance` | Purge des sessions/jetons expirés (cron quotidien) |
| `npm run smoke` | Vérification post-déploiement : connexion + 17 pages clés + `/api/health` |
| `npm run env:check` | Valide la configuration avant déploiement (Netlify, Supabase, secrets) ; code 1 si bloquant |
| `npm run db:reset` | Supprime la base locale et le stockage local (`-- --yes` obligatoire) |

## Architecture en bref

- **Monolithe modulaire** Next.js (App Router) : `src/modules/<domaine>` (services + Server Actions),
  `src/lib` (socle technique), `src/components` (design system et formulaires partagés).
- **PostgreSQL** via Supabase (offre gratuite suffisante, cf. [`docs/supabase.md`](docs/supabase.md)) ou PGlite en développement — mêmes migrations SQL
  (`supabase/migrations`). Schéma `app`, RLS activée et **forcée** sur toutes les tables métier,
  rôle applicatif non-superutilisateur `organix_app` pour que les politiques s'appliquent vraiment.
- **Permissions** : 6 rôles, 16 modules, 7 actions — 61 permissions effectives (chaque module n'active que les actions pertinentes) — vérifiées côté serveur
  (pages, Server Actions et politiques RLS pour les modules sensibles).
- **Argent** : entiers en unité mineure (`*_minor bigint`), jamais de flottant en base.
- **Audit** : journal par organisation, écrit dans la même transaction que l'action métier.
- **Intégrations remplaçables** : e-mail (`console` ou Resend via HTTP) et stockage (`local` ou
  bucket privé Supabase Storage) choisis par variable d'environnement, sans dépendance à un SDK.
- **Décisions documentées** : suppression logique et RLS (`docs/securite.md`), périmètre RH sans
  paie, finances non certifiées. Les écrans rappellent ces limites.

## Documentation

| Document | Contenu |
| --- | --- |
| [`docs/DIAGNOSTIC.md`](docs/DIAGNOSTIC.md) | Diagnostic technique, architecture proposée, plan, schéma initial, coûts |
| [`docs/installation.md`](docs/installation.md) | Installation Windows / macOS / Linux, développement et Supabase |
| [`docs/supabase.md`](docs/supabase.md) | **Déploiement Supabase (offre gratuite)** : pooler, migrations, Storage privé, keep-alive, sauvegardes |
| [`docs/configuration.md`](docs/configuration.md) | Toutes les variables d'environnement |
| [`docs/architecture.md`](docs/architecture.md) | Organisation du code, flux de données, conventions |
| [`docs/securite.md`](docs/securite.md) | Modèle de sécurité, RLS, limites connues |
| [`docs/administration.md`](docs/administration.md) | Rôles, permissions, gestion de l'équipe et des modules |
| [`docs/guide-utilisateur.md`](docs/guide-utilisateur.md) | Guide des écrans disponibles |
| [`docs/netlify.md`](docs/netlify.md) | **Déploiement Netlify** : variables, limites serverless, domaine, cron de maintenance |
| [`docs/deploiement.md`](docs/deploiement.md) | Mise en production, domaine, sauvegardes |
| [`docs/sauvegarde-restauration.md`](docs/sauvegarde-restauration.md) | Sauvegarde et restauration vérifiables (script testé) |
| [`PROJECT_STATUS.md`](PROJECT_STATUS.md) | État module par module, tests exécutés, limites |

## Licence

Interne — aucun contrat de licence n'a été choisi à ce stade (à décider avec le commanditaire).
