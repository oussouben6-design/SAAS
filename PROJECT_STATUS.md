# PROJECT STATUS — ORGANIX

Dernière mise à jour : **2 novembre 2026** (branche `arena/2ac590d2-saas`).

Ce document décrit l'état **réellement vérifié** du produit. Aucune fonctionnalité n'y est déclarée
comme opérationnelle sans test automatisé ou vérification HTTP associée. Les éléments non terminés
sont explicitement listés.

---

## 1. Synthèse

| Indicateur | Valeur vérifiée |
| --- | --- |
| Migrations SQL | 10/10 appliquées sans erreur (PGlite), idempotentes |
| Tables métier | 46 |
| Politiques RLS | 125 (RLS activée **et forcée** sur toutes les tables métier) |
| Permissions | 61 (catalogue 16 modules × 7 actions, actions activées par module), 6 rôles par défaut |
| `npm run typecheck` | ✅ 0 erreur |
| `npm run lint` | ✅ 0 erreur, 0 avertissement |
| `npm test` (Vitest) | ✅ **83 tests / 83** en 11 fichiers (~50 s) |
| `npm run build` | ✅ build de production, 44 routes ; `next start` vérifié avec en-têtes CSP/HSTS |
| Sauvegarde / restauration | ✅ `db:backup --verifier` puis `db:restore` testés sur la base locale (empreintes, intégrité, volumétrie) |
| Supervision / vérification | ✅ `GET /api/health` (200, 10/10 migrations) et `npm run smoke` : **19/19 contrôles HTTP réussis** |
| CI GitHub Actions | ✅ **exécuté et vert** sur GitHub (types, lint, 82 tests, build — 1 min 47 s) |
| Parcours HTTP vérifié manuellement | ✅ pages RH / Finances / Partenaires / Communication et onglets en 200 (admin) ; refus de permission en 307 vers `/app/acces-refuse` |
| `npm run test:e2e` (Playwright) | ⚠️ **Non exécuté** — navigateurs non téléchargeables dans l'environnement |
| Déploiement | ⚠️ **Aucun** — voir `docs/deploiement.md` |

---

## 2. Modules : état exact

| Module | État | Ce qui fonctionne réellement | Ce qui manque |
| --- | --- | --- | --- |
| Authentification | ✅ Opérationnel | Inscription, connexion, déconnexion, sessions en base, révocation, **gestion des sessions actives par l'utilisateur**, mot de passe oublié/réinitialisation, vérification e-mail (jeton), limitation de débit | 2FA ; transport SMTP non implémenté |
| Organisations & onboarding | ✅ Opérationnel | Création d'organisation (rôles, pipeline, catégories, modules), identité, devise, fuseau, départements | Suppression d'organisation, logo (colonne présente, upload non exposé) |
| Collaborateurs & invitations | ✅ Opérationnel | Invitation avec jeton, acceptation, rôles multiples, suspension, protection du propriétaire | Renvoi d'invitation en un clic |
| Rôles & permissions | ✅ Opérationnel | Matrice 16×7 éditable, verrouillage du rôle propriétaire, audit | Duplication de rôle |
| Tableau de bord | ✅ Opérationnel | KPI et graphiques calculés sur les données réelles, période sélectionnable, sections masquées selon permissions | Comparaison N-1, objectifs |
| CRM (clients) | ✅ Opérationnel | CRUD, contacts, interactions, catégories, filtres, fiche détaillée, export CSV | Import CSV, fusion de doublons |
| Prospection | ✅ Opérationnel | Prospects, pipeline, opportunités, conversion prospect → client | Relances automatiques |
| Projets | ✅ Opérationnel | CRUD, budget, avancement, équipe, jalons, documents liés, filtres | Gantt, dépendances, temps passé |
| Tâches | ✅ Opérationnel | CRUD, statuts, priorités, assignation, échéances, commentaires | Sous-tâches dans l'UI, récurrence |
| Documents | ✅ Opérationnel | Dossiers, dépôt (10 Mio), catégories, rattachement, téléchargement contrôlé, suppression logique | Versioning, aperçu intégré |
| Rapports | ✅ Opérationnel | Projets/tâches/prospection + agrégats **finances** et **RH**, période, export CSV | Planification d'envoi, rapport partenaires |
| Journal d'audit | ✅ Opérationnel | Liste filtrable, écriture transactionnelle | Export, rétention configurable |
| Notifications | ✅ Opérationnel | Liste, compteur non lus, marquage lu | Temps réel |
| Recherche globale | ✅ Opérationnel | Clients, prospects, projets, tâches, documents | Recherche floue |
| **Ressources humaines** | ✅ Opérationnel (périmètre limité) | Dossiers employés (CRUD, statut, archivage), contrats, congés avec validation et contrôle de chevauchement, pointage (1 ligne/employé/jour), exports CSV, synthèse | **Aucune paie, aucun bulletin, aucune déclaration sociale** ; pas de gestion des entretiens/formations |
| **Finances** | ✅ Opérationnel (périmètre limité) | Devis → facture, factures numérotées (`FAC-AAAA-NNNN` / `DEV-AAAA-NNNN`), lignes et totaux HT/TVA/TTC, encaissements (partiels, plafonnés au solde), statut dérivé des paiements, dépenses avec validation par un tiers, recettes, catégories, exports CSV | **Pas une comptabilité certifiée** ; pas de lettrage bancaire, rapprochement, TVA déclarative, relances |
| **Partenaires** | ✅ Opérationnel | Liste filtrable, fiche détaillée, contacts (contact principal unique), conventions (période validée), archivage logique, **export CSV** (`partners:export`) | Pièces jointes de convention, évaluation fournisseur |
| **Communication** | ✅ Opérationnel (périmètre limité) | Annonces (audience : tous / département / administrateurs, filtrage appliqué par RLS), épinglage, expiration, calendrier d'événements partagé | **Pas de messagerie instantanée**, pas de notifications temps réel |
| **Assistant IA** | 🚧 Non disponible | Aucun appel externe, même si `OPENAI_API_KEY` est définie ; page d'état | Tout (cadrage, fournisseur, permissions, budget) |
| Multi-organisations | 🟡 Base utilisable | Cookie d'organisation active, sélecteur dans Paramètres → Organisation, création d'une organisation supplémentaire avec bascule automatique | Facturation/quotas SaaS, sélecteur permanent dans la barre latérale |

Légende : ✅ vérifié · 🟡 partiel · 🚧 non utilisable (marqué comme tel dans l'interface).

---

## 3. Tests réellement exécutés

```
npx tsc --noEmit        → 0 erreur
npm run lint            → 0 erreur, 0 avertissement
npm test                → Test Files 11 passed (11) · Tests 83 passed (83) · ~50 s
npm run build           → succès, 44 routes
npm run smoke -- --token … → 19/19 contrôles (16 pages + 2 publiques + /api/health)
npm run db:backup -- --verifier → 1228 empreintes OK, 46 tables, 125 politiques RLS
npm run db:restore ...  → base restaurée, 9/9 migrations, 6 profils, 5 clients, 3 factures
```

| Fichier | Couverture |
| --- | --- |
| `tests/unit/permissions.test.ts` | 6 rôles, propriétaire = total du catalogue, lecteur en lecture seule |
| `tests/unit/validation.test.ts` | Schémas Zod partagés, montants en unité mineure (XOF/EUR) |
| `tests/unit/components.test.tsx` | Design system (RTL + jsdom) |
| `tests/unit/backup.test.ts` | Sauvegarde PGlite (copie + manifeste), contrôle d'empreintes, détection de corruption, refus d'écrasement sans `--force`, copie de sécurité, vérification par ouverture réelle |
| `tests/unit/integrations.test.ts` | E-mails (console, Resend avec `fetch` simulé, échec HTTP, échappement HTML), stockage local (écriture/lecture/suppression, anti-traversée), stockage Supabase (requête REST, configuration incomplète, erreur 404) |
| `tests/integration/security.test.ts` | Isolation inter-organisations, insertion croisée refusée, membre suspendu sans accès, RH inaccessible au lecteur, audit par organisation |
| `tests/integration/auth.test.ts` | Hachage scrypt, cycle de session, **liste et révocation de sessions (y compris refus de révoquer celle d'un autre utilisateur)**, réinitialisation, vérification e-mail |
| `tests/integration/workflows.test.ts` | Projets/jalons, tâches et commentaires, conversion prospect → client, invitation → acceptation → rôles, protection du propriétaire, drapeau `is_demo` |
| `tests/integration/finance.test.ts` | Numérotation, totaux HT/TVA/TTC, encaissement partiel → payé, refus de dépassement, facture payée verrouillée, transition invalide, devis → facture (une seule fois), dépenses (auto-validation interdite, suppression bloquée) |
| `tests/integration/hr.test.ts` | Employés (CRUD, archivage, date de fin invalide), contrats, congés (chevauchement, approbation → statut employé, nouvelle décision refusée), pointage unique par jour, statut invalide |
| `tests/integration/partners-communication.test.ts` | Partenaires (CRUD, archivage logique), contacts + contact principal unique, conventions (dates), annonces (création, audience, visibilité par rôle), calendrier (dates) |

**Non exécutés** : les tests Playwright (`tests/e2e/*.spec.ts`) — navigateurs impossibles à
télécharger dans cet environnement.

**CI** : exécutée sur GitHub le 2 novembre 2026 (run `41447870753`) — job « Types, lint, tests et
build » **vert en 1 min 47 s**. Les actions ont été mises à jour (`checkout@v5`, `setup-node@v5`).

---

## 4. Vérifications manuelles effectuées (serveur réel)

- Pages en **200** avec une session administrateur sur la base de démonstration : `/app`,
  `/app/parametres/organisation`, `/app/rapports`, `/app/journal`, `/app/finances` (et onglets
  factures/devis/dépenses/recettes/catégories), `/app/rh` (et onglets congés/présences),
  `/app/partenaires`, `/app/communication` (annonces + calendrier).
- Données réelles affichées (jeu de démonstration enrichi) : 3 factures, 2 devis `DEV-DEMO-…`,
  5 employés avec **5 contrats**, 2 demandes de congé, **20 pointages**, 3 partenaires avec
  contacts et **2 conventions**, 5 dépenses, 2 recettes, 1 annonce, 1 événement de calendrier.
- Contrôle de permission vérifié par rôle :
  - `demo.employe` : `/app/finances` et `/app/partenaires` → 307 vers `/app/acces-refuse` ;
    `/app/communication` → 200 (annonces « tous » uniquement).
  - `demo.lecteur` : `/app/rh`, `/app/finances`, `/app/partenaires` → 307.
  - `demo.gestionnaire` : `/app/rh`, `/app/partenaires`, `/app/communication` → 200 ;
    `/app/finances` → 307.
- `npm run smoke -- --token …` : **19/19 contrôles réussis** (pages publiques, connexion, 16 pages
  métier, `/api/health` → `ok`, 10/10 migrations).
- Bandeau « Espace de démonstration » présent sur toutes les pages de l'organisation `is_demo`.
- ⚠️ 500 transitoire observé au **premier** rendu d'une route en développement
  (`ArrayBuffer is not detachable`) : spécifique à Next.js dev + PGlite, disparaît au rechargement ;
  non reproductible en build de production.

---

## 5. Problèmes rencontrés et solutions

| Problème | Solution appliquée |
| --- | --- |
| Aucun accès réseau à PostgreSQL/Supabase | PGlite avec les mêmes migrations SQL ; tests d'intégration sur base réelle embarquée |
| RLS contournée par un superutilisateur | Rôle `organix_app` + `force row level security` |
| **Suppression logique impossible** : UPDATE rejeté par RLS (`new row violates policy`) car la politique SELECT filtrait `deleted_at is null` | Migration `0008` : le filtre `deleted_at` est retiré des politiques SELECT (isolation et permissions conservées), les requêtes métier filtrent les archives ; décision documentée dans `docs/securite.md` |
| Annonces ciblées visibles par tous | Migration `0009` + filtre de service : visibilité par audience appliquée en RLS |
| Statut `employees` invalide provoquant une erreur SQL brute | Validation `EMPLOYEE_STATUSES` dans le service (erreur métier explicite) |
| Recalcul des totaux de facture : ambiguïté de typage des paramètres SQL (`text > integer`) | Statut calculé en TypeScript et paramètres castés en `bigint` |
| `next build` échoue sur les imports inutilisés | Nettoyage systématique, aucune règle désactivée |
| Erreurs de permission renvoyées en HTTP 500 | `requirePagePermission` redirige vers `/app/acces-refuse` |
| Deadlock `privileged()` dans une transaction `asMember()` | Découpage des invitations en trois phases |
| Absence de séparation réel/démo | Colonne `organizations.is_demo`, bandeau, `db:status`, seed gardé |

---

## 6. Limites connues et risques résiduels

1. **RLS de lecture inter-organisations uniquement** pour CRM/prospection/projets/partenaires : un
   rôle Lecteur n'ouvre pas la page Clients (refus serveur), mais une requête SQL exécutée avec sa
   session renverrait les lignes de son organisation. Les données RH et financières sont filtrées
   par permission en RLS. Décision produit à trancher (`docs/securite.md`).
2. **Rapports et recherche** agrègent des modules que certains rôles n'ouvrent pas en lecture.
3. **E-mails** : `console` (dev) et `resend` (HTTP) implémentés, `smtp` non. Resend **non testé
   contre un compte réel** (pas de clé, pas de réseau sortant vers Resend ici).
4. **Stockage** : `local` fonctionne ; `supabase` implémenté mais **non testé contre un projet
   réel**. Aucun mode S3.
5. **PGlite** : mono-processus et données gardées en mémoire. Ne lancez aucun script base pendant
   `npm run dev` et **redémarrez le serveur après une migration** (sinon le serveur ne voit pas la
   migration : symptôme observé = permission nouvellement créée « absente »). Documenté dans
   `docs/installation.md`.
6. **Tests E2E non exécutés** ; la CI tourne et est verte sur GitHub (3 exécutions).
7. **Aucun déploiement** : la mention « en production » ne doit pas être utilisée.
8. **Assistant IA** non implémenté ; aucun appel sortant.
9. **Multi-organisations** : bascule et création disponibles, mais pas de facturation, quotas, ni
   sélecteur permanent (accessible via Paramètres → Organisation).
10. **Accessibilité** : structure sémantique et focus gérés, aucun audit RGAA/WCAG complet.
11. **Sauvegardes** : scripts `db:backup`/`db:restore` **testés sur la base PGlite locale**
    (sauvegarde, contrôle d'empreintes, restauration et vérification d'intégrité). Restauration
    sur une base PostgreSQL distante **non testée** (aucun serveur accessible).
12. **Sauvegarde/restauration du stockage objet** non traitée (dépend du fournisseur).

---

## 7. Comptes de démonstration (base locale uniquement)

`demo.admin@organix.local`, `demo.directeur@organix.local`, `demo.responsable@organix.local`,
`demo.gestionnaire@organix.local`, `demo.employe@organix.local`, `demo.lecteur@organix.local`.
Mot de passe : `Demo-Organix-2026!` (ou `ORGANIX_SEED_PASSWORD`). L'organisation est marquée
`is_demo` et signalée par un bandeau permanent.

---

## 8. Prochaines missions recommandées (par priorité)

1. **Déploiement réel + sauvegardes** : créer le projet Supabase, appliquer les migrations, tester
   une restauration, exécuter le workflow CI sur GitHub.
2. **Transport d'e-mail réel** : fournir une clé Resend (gratuit) et un domaine vérifié ; activer
   ensuite la vérification d'adresse obligatoire.
3. **Stockage objet** : valider le pilote Supabase Storage sur un bucket privé réel (ou S3), avec
   sauvegarde des fichiers.
4. **Finances niveau 2** : relances d'impayés, échéanciers, lettrage, TVA déclarative, exports
   comptables — avec validation par un comptable (aucune promesse de conformité fiscale).
5. **RH niveau 2** : paie **uniquement si le cadre légal local est fourni** (barèmes, cotisations),
   entretiens, formations, organigramme.
6. **Partenaires/communication** : pièces jointes aux conventions, abonnements au calendrier (ICS),
   notifications temps réel.
7. **Assistant IA** : sur autorisation explicite (fournisseur, coûts, données autorisées).
8. **Durcissement** : généraliser `<module>:read` en RLS, CSP, 2FA, purge des sessions expirées.

---

## 9. Décisions de périmètre à valider

- Inscription libre (`AUTH_ALLOW_REGISTRATION`) : ouverte en développement, à fermer en production.
- Vérification d'e-mail : désactivée tant qu'aucun transport réel n'est configuré.
- Suppression d'organisation : volontairement non exposée (opération destructrice).
- RH : aucun calcul de paie ni de cotisations — décision explicite (voir écran du module).
- Aucun service payant souscrit ; aucune donnée envoyée à un tiers.
