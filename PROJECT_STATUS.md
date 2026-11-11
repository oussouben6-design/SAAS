# PROJECT STATUS — Excellence 360 CRM

Dernière mise à jour : **11 novembre 2026** (branche `arena/1787ab9b-saas` : **code de connexion par
e-mail (OTP)** à chaque connexion — 24 migrations, schéma conforme au dépôt et vérifié en base).

Ce document décrit l'état **réellement vérifié** du produit. Aucune fonctionnalité n'y est déclarée
comme opérationnelle sans test automatisé ou vérification HTTP associée. Les éléments non terminés
sont explicitement listés.

---

## 1. Synthèse

| Indicateur | Valeur vérifiée |
| --- | --- |
| Migrations SQL | **24/24** appliquées sans erreur (PGlite), idempotentes — `0015`→`0023` couvrent la récupération de la dérive Supabase, le durcissement et le contexte RLS lisant le jeton ; `0024` ajoute `login_challenges` (code de connexion par e-mail) — migrations `0015`→`0024` non encore appliquées en production, à jouer à la mise en ligne (cf. [`docs/audit-derive-supabase.md`](./docs/audit-derive-supabase.md)) |
| Tables métier | 50 |
| Audit de dérive Git ↔ base | ✅ `npm run db:audit` + verrou `supabase/schema-lock.json` (134 politiques, 31 déclencheurs, 13 fonctions, 567 colonnes) — étape ajoutée à la CI |
| Politiques RLS | **134** (RLS activée **et forcée** sur les 50 tables publiques) ; 0 politique lisible sans restriction (`for all`/`for select` sans `USING`), contrôlé par `npm run db:audit` |
| Permissions | 61 (catalogue 16 modules × 7 actions, actions activées par module), 6 rôles par défaut |
| `npm run typecheck` | ✅ 0 erreur |
| `npm run lint` | ✅ 0 erreur, 0 avertissement |
| `npm test` (Vitest) | ✅ **148 tests / 148** en 21 fichiers (~80 s), dont 6 sur le contexte RLS lu depuis un JWT, 5 sur les remèdes du contrôle de configuration et **7 sur le code de connexion OTP** (6 intégration + 1 contrôle `env:check`) |
| `npm run build` | ✅ build de production vérifié ; `next start` et en-têtes CSP/HSTS vérifiés précédemment |
| `npm run env:check` (préflight Netlify) | ✅ en cas d’échec, le log liste désormais chaque variable manquante, **où** la renseigner et **d’où** tirer sa valeur (`missing` / `recommended` dans `EnvCheckResult`), sans jamais imprimer de valeur. Le garde-fou reste bloquant : un build refusé vaut mieux qu’un site en ligne sans accès à sa base |
| Sauvegarde / restauration | ✅ `db:backup --verifier` puis `db:restore` testés sur la base locale (empreintes, intégrité, volumétrie) |
| Hébergement Netlify | ✅ Configuré et vérifié | `netlify.toml` (build `env:check && build`, Node 22, paquets natifs externes) ; refus explicite de PGlite/stockage local en serverless ; `npm run env:check` (règles testées, dont la configuration Google) ; `/api/maintenance` protégé par jeton (401/200 vérifiés) ; cron GitHub Actions (santé + purge) | Déploiement réel à effectuer par le propriétaire (compte Netlify) |
| Supervision / vérification | ✅ `GET /api/health` (200, 24/24 migrations) et `npm run smoke` : **20/20 contrôles HTTP réussis** (connexion TOTP→OTP réelle, jeton injecté) |
| CI GitHub Actions | ✅ **verte sur `main`** après fusion de la PR #6 (run `42422750335` : types, lint, 148 tests, préflight Netlify, **audit de schéma**, build). Les six étapes passent ; `npm run test:e2e` (Playwright) n’est pas à la CI |
| Base de production | 🟡 **assainie** (8 nov. : 0 compte orphelin, `auth.users = 0`) ; journal `app.migrations` à **23** = 23 migrations du dépôt jusqu'à cette branche ; **la `0024_login_challenges` doit être appliquée en production** au déploiement (`npm run db:migrate` ou le connecteur Supabase) — sans elle, la connexion OTP échouerait côté base |
| Parcours HTTP vérifié manuellement | ✅ pages RH / Finances / Partenaires / Communication et onglets en 200 (admin) ; refus de permission en 307 vers `/app/acces-refuse` |
| `npm run test:e2e` (Playwright) | ⚠️ **Non exécuté** — navigateurs non téléchargeables dans l'environnement |
| Déploiement | ⚠️ **Bloqué côté Netlify, pas côté dépôt** — le build de production échoue sur `env:check` tant que `DATABASE_URL`, `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` ne sont pas saisies sur le **site qui déploie `main`** (portée builds **et** fonctions) ; **et** tant que Resend n'est pas configuré (`MAIL_TRANSPORT=resend` + `RESEND_API_KEY`) ou que `AUTH_LOGIN_OTP=false` n'est pas posé (le code OTP, actif par défaut, exige un envoi d'e-mail réel) : `docs/netlify.md` § 3 et § 3.1 |
| Sites Netlify branchés | ⚠️ **Cinq** projets construisent le même dépôt, chacun avec son propre jeu de variables — cause directe du « la variable est pourtant saisie » ; à ramener à un (`docs/netlify.md` § 2.1) |
| Garde-fou réservé à la production | ✅ `netlify.toml` déclare `[context.deploy-preview]` et `[context.branch-deploy]` en `npm run build` : un aperçu ne peut plus échouer sur des secrets qu'il ne doit pas recevoir (`next build` sans aucune variable = code 0, vérifié le 8 nov.) |
| Extensions `pg_cron` / `pg_net` | ⚠️ **Non installées** — sans effet sur la purge des sessions, assurée par `.github/workflows/cron.yml` + `MAINTENANCE_SECRET` ; à activer seulement pour le keep-alive du projet gratuit (`docs/supabase.md` § 7) |

---

## 2. Modules : état exact

| Module | État | Ce qui fonctionne réellement | Ce qui manque |
| --- | --- | --- | --- |
| Supabase (offre gratuite) | 🟡 Appliqué et vérifié, **en attente des secrets Netlify** | Projet `opnlvqwbevnivfjpbrxa` (PG 17, eu-west-3) : bucket privé `documents` créé, `FORCE RLS` + bascule de rôle validées sur Supabase, `pg_cron`/`pg_net` **non installés** (à activer dans Supabase → Extensions). Migrations `0012` (autorisation `SET` du rôle applicatif) et `0013` (révocation des rôles `anon`/`authenticated`) ajoutées ; `npm run db:status` contrôle version, RLS forcée, bascule de rôle | Schéma appliqué (14 migrations le 5 nov., 23 depuis). **Dérive constatée le 7 nov.** : 5 migrations appliquées hors Git et privilèges `0013` annulés. **Corrections `0015`→`0023` rejouées sur la base** le 7 nov. à 22:5x UTC et vérifiées (133 politiques, 0 politique lisible sans restriction, 1 seul privilège `authenticated` toléré, RLS forcée sur 49/49, journal à 23 entrées) ([`docs/audit-derive-supabase.md`](./docs/audit-derive-supabase.md)) |
| Comptes réels (hors démo) | ✅ Opérationnel | Inscription `/inscription` → onboarding → espace réel (`is_demo = false`, aucun bandeau), ou `npm run admin:create` (compte + organisation + rôle propriétaire, mot de passe généré) ; parcours vérifié en HTTP (303 → `/app`, pages 200) et par test d'intégration | — |
| Authentification | ✅ Opérationnel | Inscription, connexion, déconnexion, sessions en base, révocation, gestion des sessions actives, mot de passe oublié/réinitialisation, vérification e-mail (jeton), limitation de débit, **double authentification TOTP** (chiffrement AES-256-GCM, codes de secours), **connexion Google OAuth/OIDC** (PKCE, vérification du jeton, liaison de compte, MFA conservée), **code de connexion à usage unique envoyé par e-mail (OTP) à CHAQUE connexion** — en plus du mot de passe (et après la 2FA le cas échéant) ; défi 10 min, 5 essais, empreinte scrypt, `AUTH_LOGIN_OTP=false` pour désactiver | 2FA facultative ; transport SMTP non implémenté ; identifiants Google réels à configurer ; **sans transport d'e-mail réel (Resend), le code OTP empêche toute connexion : `env:check` bloque le déploiement** |
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
npm test                → Test Files 21 passed (21) · Tests 148 passed (148) · ~78 s
npm run build           → succès (build de production vérifié sur la branche, 11 nov. 2026)
Netlify (simulation)     → env:check + build OK avec valeurs factices, sans connexion externe
npm run env:check (simulation Netlify) → 0 erreur avec les secrets factices ; 4 erreurs,
chacune suivie du lieu de saisie et de la source de la valeur, dès qu’un secret manque
npm run smoke -- --token … → 20/20 contrôles (17 pages + 2 publiques + /api/health)
npm run db:backup -- --verifier → empreintes OK, 49 tables, 133 politiques RLS (base de dev, avant 0024)
npm run db:restore ...  → base restaurée depuis une sauvegarde vérifiée (1228 empreintes), 6 profils
npm run db:migrate      → 24/24 migrations, 50 tables, 134 politiques RLS
Vérification HTTP de l'OTP (dev, transport console) : authenticate → `login_otp_required` (aucun
jeton de session en base) ; completeLoginOtp avec le code → session ouverte ; smoke 20/20 avec le
jeton obtenu via le flux OTP réel
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
| `tests/integration/login-otp.test.ts` | **Code de connexion OTP** : actif par défaut, désactivable ; aucune session après le mot de passe seul ; ouverture après le code (jeton validable) ; empreinte scrypt en base (jamais le code en clair) ; 5 essais max puis défi invalidé ; défi à usage unique ; chaîne mot de passe → TOTP → OTP ; `AUTH_LOGIN_OTP=false` restaure la connexion en une étape |
| `tests/unit/google.test.ts` | Vecteur PKCE RFC 7636, URL d'autorisation, jetons OIDC signés RSA : signature, émetteur, audience, expiration, nonce et e-mail vérifié |
| `tests/integration/google-auth.test.ts` | Création sans mot de passe, liaison par e-mail puis par `sub`, compte inactif, inscriptions fermées, MFA après Google |
| `tests/integration/workflows.test.ts` | Projets/jalons, tâches et commentaires, conversion prospect → client, invitation → acceptation → rôles, protection du propriétaire, drapeau `is_demo` |
| `tests/integration/finance.test.ts` | Numérotation, totaux HT/TVA/TTC, encaissement partiel → payé, refus de dépassement, facture payée verrouillée, transition invalide, devis → facture (une seule fois), dépenses (auto-validation interdite, suppression bloquée) |
| `tests/integration/hr.test.ts` | Employés (CRUD, archivage, date de fin invalide), contrats, congés (chevauchement, approbation → statut employé, nouvelle décision refusée), pointage unique par jour, statut invalide |
| `tests/integration/partners-communication.test.ts` | Partenaires (CRUD, archivage logique), contacts + contact principal unique, conventions (dates), annonces (création, audience, visibilité par rôle), calendrier (dates) |

**Non exécutés** : les tests Playwright (`tests/e2e/*.spec.ts`) — navigateurs impossibles à
télécharger dans cet environnement.

**CI** : dernière exécution sur la PR #4 (run `42067007177`) — job « Types, lint, tests et build »
**vert en 2 min 41 s**, avec 128 tests. Les actions utilisent `checkout@v5` et `setup-node@v5`.

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
- Flux Google vérifié en HTTP avec des identifiants de démonstration : bouton sur connexion/inscription,
  redirection OAuth avec PKCE/state/nonce, refus d'un `state` falsifié et gestion de l'annulation (7/7) ;
  non-régression de la connexion par mot de passe (4/4). **Un compte Google réel reste à tester.**
- Préflight `npm run env:check` en simulation Netlify : **0 erreur** avec les trois secrets
  (valeurs factices, aucune connexion externe) et **4 erreurs** assorties de leur remède dès
  qu’un secret manque — cas du premier déploiement Netlify.
- `npm run smoke -- --token …` : **20/20 contrôles réussis** (pages publiques, connexion, 17 pages
  métier, `/api/health` → `ok`, 24/24 migrations).
- **Flux OTP vérifié de bout en bout (base de démonstration, transport console)** : `authenticate`
  renvoie `login_otp_required` sans créer de session (vérifié en base : 0 session, code haché en
  base avec préfixe `scrypt:`) ; le code affiché à l'écran en développement permet à
  `completeLoginOtp` d'ouvrir la session ; `npm run smoke -- --token …` alors **20/20**.
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
| **Base PGlite corrompue** (`RuntimeError: Aborted()` au démarrage, pages en 500) après arrêt brutal du serveur | Restauration vérifiée depuis `backups/organix-20261103-122220` (1228 empreintes), migration `0011` puis re-seed. Prévention : verrou `.organix-instance.lock` (refus explicite d'un second processus), fermeture propre sur `SIGTERM`/`SIGINT`, procédure de reprise documentée (`docs/installation.md`, `docs/sauvegarde-restauration.md`) |
| Build lancé pendant `npm run dev` → chunks manquants (`Cannot find module './NNN.js'`), pages en 500 | Suppression de `.next`, redémarrage du serveur ; interdit documenté dans les pièges PGlite |

---

## 6. Limites connues et risques résiduels

1. **RLS de lecture inter-organisations uniquement** pour CRM/prospection/projets/partenaires : un
   rôle Lecteur n'ouvre pas la page Clients (refus serveur), mais une requête SQL exécutée avec sa
   session renverrait les lignes de son organisation. Les données RH et financières sont filtrées
   par permission en RLS. Décision produit à trancher (`docs/securite.md`).
2. **Rapports et recherche** agrègent des modules que certains rôles n'ouvrent pas en lecture.
3. **E-mails** : `console` (dev) et `resend` (HTTP) implémentés, `smtp` non. Resend **non testé
   contre un compte réel** (pas de clé, pas de réseau sortant vers Resend ici).
   ⚠️ Conséquence directe : le **code de connexion OTP étant actif par défaut**, une mise en
   production sans Resend bloque toute connexion ; `npm run env:check` refuse alors le build.
   Ordre obligatoire : (1) Resend + `MAIL_FROM` vérifié, (2) déployer, (3) tester un code reçu.
   `AUTH_LOGIN_OTP=false` reste la soupape d'urgence (documentée, connexion par mot de passe seul).
4. **Stockage** : `local` fonctionne ; `supabase` implémenté mais **non testé contre un projet
   réel**. Aucun mode S3.
5. **PGlite** : mono-processus et données gardées en mémoire. Ne lancez aucun script base pendant
   `npm run dev` et **redémarrez le serveur après une migration** (sinon le serveur ne voit pas la
   migration : symptôme observé = permission nouvellement créée « absente »). Documenté dans
   `docs/installation.md`.
6. **Tests E2E non exécutés** ; la CI tourne et est verte sur GitHub (3 exécutions).
7. **Aucun déploiement** : la mention « en production » ne doit pas être utilisée. Les prévisualisations
   Netlify de la PR #4 sont en échec ; leurs journaux et les variables d'environnement des sites doivent
   être traités avant de considérer Netlify comme validé (le build local et la CI GitHub sont verts).
8. **Assistant IA** non implémenté ; aucun appel sortant.
9. **Multi-organisations** : bascule et création disponibles, mais pas de facturation, quotas, ni
   sélecteur permanent (accessible via Paramètres → Organisation).
10. **Accessibilité** : structure sémantique et focus gérés, aucun audit RGAA/WCAG complet.
11. **Sauvegardes** : scripts `db:backup`/`db:restore` **testés sur la base PGlite locale**
    (sauvegarde, contrôle d'empreintes, restauration et vérification d'intégrité). Restauration
    sur une base PostgreSQL distante **non testée** (aucun serveur accessible).
12. **Sauvegarde/restauration du stockage objet** non traitée (dépend du fournisseur).
13. **Connexion Google réelle non exécutée** : le flux OAuth et les contrôles de sécurité sont testés,
    mais les identifiants présents dans l'environnement local sont des exemples. Il faut renseigner
    les vrais `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, puis tester avec un compte Google.

---

## 7. Comptes de démonstration (base locale uniquement)

`demo.admin@organix.local`, `demo.directeur@organix.local`, `demo.responsable@organix.local`,
`demo.gestionnaire@organix.local`, `demo.employe@organix.local`, `demo.lecteur@organix.local`.
Mot de passe : `Demo-Organix-2026!` (ou `ORGANIX_SEED_PASSWORD`). L'organisation est marquée
`is_demo` et signalée par un bandeau permanent.

---

## 8. Prochaines missions recommandées (par priorité)

1. **Finaliser la connexion Google** : créer les identifiants OAuth dans Google Cloud, déclarer
   `<APP_URL>/api/auth/google/callback`, renseigner les secrets dans l'environnement et tester une
   connexion réelle (guide : `docs/configuration.md`).
2. **Déploiement réel + sauvegardes** : créer le projet Supabase, appliquer les 24 migrations
   (dont `0024_login_challenges`), tester une restauration, exécuter le workflow CI sur GitHub et
   déployer sur Netlify.
3. **Transport d'e-mail réel (prérequis OTP)** : fournir une clé Resend (gratuit) et un domaine
   vérifié ; sans cela, définir `AUTH_LOGIN_OTP=false` le temps du déploiement ; activer ensuite
   la vérification d'adresse obligatoire.
4. **Stockage objet** : valider le pilote Supabase Storage sur un bucket privé réel (ou S3), avec
   sauvegarde des fichiers.
5. **Finances niveau 2** : relances d'impayés, échéanciers, lettrage, TVA déclarative, exports
   comptables — avec validation par un comptable (aucune promesse de conformité fiscale).
6. **RH niveau 2** : paie **uniquement si le cadre légal local est fourni** (barèmes, cotisations),
   entretiens, formations, organigramme.
7. **Partenaires/communication** : pièces jointes aux conventions, abonnements au calendrier (ICS),
   notifications temps réel.
8. **Assistant IA** : sur autorisation explicite (fournisseur, coûts, données autorisées).
9. **Durcissement** : généraliser `<module>:read` en RLS, purge planifiée des sessions expirées,
   obligation de 2FA pour les rôles administrateurs.

---

## 8 bis. Dérive du 7 novembre 2026 (soldée)

La base Supabase contenait **5 migrations jamais versionnées** (`0015`→`0019` dans son journal) et
**les révocations de `0013` annulées** : `authenticated` avait `SELECT/INSERT/UPDATE/DELETE` sur
43 des 49 tables métier, et `anon` pouvait exécuter deux fonctions de déclencheur. **Lecture
erronée corrigée depuis** : `polcmd = 'a'` signifie INSERT (et non « ALL ») — il n'y a jamais eu de
politique ouvrant une lecture inter-organisations, ni dans le dépôt ni en base. Le défaut réel
était **fonctionnel** : `app.current_user_id()` ignorait le jeton Supabase, donc toute voie HTTP
(RPC `security definer`, Realtime) arrivait sans identité et se voyait opposer un refus systématique.

État : `0015`→`0023` appliquées **et vérifiées** en base (définition de `app.current_user_id()`
identique au dépôt, empreinte md5 contrôlée des deux côtés), garde `npm run db:audit` en CI,
modèle « RPC assumé » retenu et écrit dans `docs/audit-derive-supabase.md` § 5. 141/141 tests, dont
6 nouveaux sur le contexte JWT (`tests/integration/jwt-rls-context.test.ts`).

## 9. Décisions de périmètre à valider

- Inscription libre (`AUTH_ALLOW_REGISTRATION`) : ouverte en développement, à fermer en production.
- Vérification d'e-mail : désactivée tant qu'aucun transport réel n'est configuré.
- Suppression d'organisation : volontairement non exposée (opération destructrice).
- RH : aucun calcul de paie ni de cotisations — décision explicite (voir écran du module).
- Aucun service payant souscrit ; aucune donnée envoyée à un tiers.
