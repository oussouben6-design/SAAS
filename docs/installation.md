# Installation

Deux modes de base de données sont pris en charge, avec **les mêmes migrations SQL** :

| Mode | Usage | Prérequis |
| --- | --- | --- |
| `pglite` | Développement, démonstration, tests | Aucun service externe |
| `postgres` | Production (Supabase ou PostgreSQL auto-hébergé) | Une base PostgreSQL 15+ accessible |

## 1. Prérequis

- **Node.js 20.9 ou supérieur** (testé sur Node 22.22). Vérifiez : `node -v`.
- **npm 10+** (livré avec Node). Vérifiez : `npm -v`.
- Git.
- Environ 700 Mo d'espace disque pour `node_modules`.

### Windows

1. Installez Node.js LTS depuis <https://nodejs.org> (programme d'installation `.msi`).
2. Ouvrez **PowerShell** (ou Windows Terminal) et vérifiez `node -v` puis `npm -v`.
3. Installez Git pour Windows : <https://git-scm.com/download/win>.
4. Si PowerShell bloque l'exécution de `npm.ps1` :
   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
   ```
5. Les commandes ci-dessous fonctionnent telles quelles ; remplacez `cp` par `copy` si vous
   utilisez `cmd.exe` (PowerShell accepte `cp`).

### macOS / Linux

`node -v`, `npm -v`, `git --version` doivent répondre. Aucun autre paquet système n'est nécessaire :
PGlite est compilé en WebAssembly.

## 2. Installation locale (mode PGlite, recommandé pour découvrir)

```bash
git clone <votre-dépôt> excellence360-crm
cd excellence360-crm
npm install
cp .env.example .env.local
npm run db:migrate
npm run dev
```

- `.env.local` livré par défaut : `DATABASE_MODE=pglite`, `ORGANIX_DATA_DIR=.data/pglite`,
  `MAIL_TRANSPORT=console` (les e-mails sont écrits dans la console du serveur).
- La base est créée dans `.data/pglite` (ignoré par Git). Les migrations s'appliquent
  automatiquement au premier accès, `npm run db:migrate` permet de les lancer explicitement.
- Ouvrez <http://localhost:3000>, créez un compte avec `/inscription`, complétez l'onboarding.

### Jeu de démonstration (facultatif)

```bash
npm run db:seed
```

Crée l'organisation **« Entreprise Témoin (démonstration) »** (`is_demo = true`) avec 6 comptes
(un par rôle), des clients, prospects, projets, tâches, documents, employés, factures et dépenses
**fictifs**. Le mot de passe est généré et affiché une seule fois (ou fourni via
`ORGANIX_SEED_PASSWORD`). Le script refuse de s'exécuter deux fois sans `-- --force`, qui supprime
**uniquement** les organisations marquées comme démonstration.

### Réinitialiser la base locale

```bash
npm run db:reset                  # affiche ce qui serait supprimé, ne supprime rien
npm run db:reset -- --yes         # supprime .data/pglite et .data/storage
npm run db:reset -- --yes --keep-storage
```

La commande refuse de s'exécuter si la configuration pointe vers un PostgreSQL distant.

## 3. Installation avec Supabase (production)

> Guide détaillé, spécifique à l'offre gratuite (pooler, Storage privé, keep-alive, sauvegardes) :
> [`docs/supabase.md`](supabase.md).

1. Créez un projet sur <https://supabase.com> (plan gratuit suffisant pour démarrer).
2. **Project Settings → Database → Connection string → URI** : copiez la chaîne du *pooler*
   (port `6543`).
3. Renseignez `.env.local` (ou les variables de votre hébergeur) :
   ```ini
   DATABASE_MODE=postgres
   DATABASE_URL=postgresql://postgres.xxxxx:MOT_DE_PASSE@aws-0-eu-west-3.pooler.supabase.com:6543/postgres
   DATABASE_SSL=true
   APP_URL=https://votre-domaine
   AUTO_MIGRATE=false
   ```
4. Appliquez les migrations :
   ```bash
   npm run db:migrate
   npm run db:status
   ```
5. Vérifiez que le rôle applicatif existe et que la RLS est forcée :
   ```sql
   select rolname from pg_roles where rolname = 'organix_app';
   select relname, relrowsecurity, relforcerowsecurity
   from pg_class where relname in ('customers','invoices','employees','documents');
   ```
   `relrowsecurity` et `relforcerowsecurity` doivent être `true`.

> **Attention** : `npm run db:seed` refuse de créer des données de démonstration sur une base
> distante, sauf `ORGANIX_SEED_ALLOW_REMOTE=true`. Ne le faites pas sur la base de production.

### Alternative auto-hébergée

Tout PostgreSQL 15+ fonctionne (Docker, VPS, service managé). Créez une base vide, renseignez
`DATABASE_URL`, puis `npm run db:migrate`. Aucune extension propriétaire n'est requise
(`gen_random_uuid()` est fourni par PostgreSQL 13+).

## 4. Votre compte réel (hors démonstration)

Le jeu de démonstration (`npm run db:seed`) ne sert qu'à explorer l'interface : son organisation est
marquée `is_demo`, un bandeau le rappelle et son mot de passe est public. Pour travailler avec des
données réelles, créez votre propre compte — deux moyens équivalents :

1. **Depuis l'interface** : `/inscription` → création du compte → `/onboarding` (nom de
   l'organisation, devise, fuseau) → `/app`. Aucune donnée fictive n'est copiée ; l'organisation créée
   porte `is_demo = false`.
2. **En ligne de commande** (pratique pour provisionner le premier administrateur en production) :

```bash
npm run admin:create -- --email vous@votre-organisation.com --name "Amina Diallo" \
                       --org "Sahel Conseil" --country Niger --currency XOF \
                       --timezone Africa/Niamey --city Niamey
```

- Un mot de passe fort (≥ 16 caractères) est généré et affiché **une seule fois** ; changez-le après la
  première connexion (Paramètres → Mon profil).
- `--password '…'` permet d'en choisir un (12 caractères minimum).
- Le compte reçoit le rôle **propriétaire** (toutes les permissions du catalogue) et l'organisation
  n'est **jamais** marquée comme démonstration.
- Les adresses en `@organix.local` sont refusées : ce domaine est réservé aux comptes de démonstration.

## 5. Vérification après installation

```bash
npm run typecheck     # aucune erreur TypeScript
npm run lint          # aucune erreur ESLint
npm test              # tests unitaires + intégration (base PGlite temporaire)
npm run build         # build de production
npm run db:status     # 25/25 migrations, volumétrie
```

Puis, dans le navigateur : `/` (page publique), `/inscription`, `/connexion`, `/app` (tableau de
bord), `/app/parametres/equipe`, `/app/parametres/roles`.

## 6. Problèmes fréquents

| Symptôme | Cause probable | Solution |
| --- | --- | --- |
| `DATABASE_URL est absente` | `DATABASE_MODE=postgres` sans URL | Renseigner `DATABASE_URL` |
| `password authentication failed` | Mot de passe URL mal encodé | Encoder les caractères spéciaux (`@` → `%40`) |
| `relation "organizations" does not exist` | Migrations non appliquées | `npm run db:migrate` |
| `Cannot find module '@electric-sql/pglite'` | `npm install` incomplet | `rm -rf node_modules && npm install` |
| Le serveur démarre mais `/app` redirige vers `/connexion` | Session absente ou expirée | Se reconnecter ; vérifier l'horloge système |
| E-mail de vérification non reçu | `MAIL_TRANSPORT=console` | Le lien est affiché dans la console du serveur |
| La page de connexion demande un code à 6 chiffres | `AUTH_LOGIN_OTP` actif (défaut) | En développement, le code s'affiche à l'écran ; en production, configurez Resend (voir `docs/configuration.md`) |
| `npm run db:reset` refuse | Base distante détectée | Procédure manuelle (voir ci-dessus) |
| Un script de maintenance échoue pendant que `npm run dev` tourne | PGlite n'accepte qu'un seul processus | Arrêter le serveur avant `db:seed`, `db:status`, `db:migrate` |

## Pièges du mode PGlite (développement)

- **Un seul processus** : arrêtez `npm run dev` avant `db:migrate`, `db:seed`, `db:status`,
  `db:backup`, `db:maintenance` ou tout script utilisant la base.
- **Cache mémoire** : si une migration est appliquée pendant que le serveur tourne, le serveur
  continue de servir les données qu'il a en mémoire ; une permission ou une table nouvellement
  créée semble absente. **Redémarrez le serveur** après toute migration.
- **Sauvegardes** : `npm run db:backup` effectue une copie à froid ; ne copiez jamais
  `.data/pglite` pendant que le serveur écrit.
- **Verrou inter-processus** : PGlite n'embarque aucun verrou multi-processus. Excellence 360 CRM pose donc
  `.data/pglite/.excellence360-instance.lock` (PID + horodatage). Une seconde commande sur le même
  répertoire échoue immédiatement avec un message explicite (« déjà utilisée par le processus N »)
  au lieu de corrompre la base. Un verrou laissé par un processus mort est repris automatiquement.
- **Arrêt propre** : le serveur Next.js ferme PGlite sur `SIGTERM`/`SIGINT` (journal :
  `[excellence360:db] arrêt du serveur, fermeture de la base…`). Évitez `kill -9` : un arrêt brutal en
  pleine écriture laisse la base dans un état irrécupérable par PostgreSQL-WASM.
- **`next build` pendant `npm run dev`** : interdit. Le build réécrit `.next/` sous les pieds du
  serveur de développement (erreurs `Cannot find module './NNN.js'`, pages en 500). Arrêtez le
  serveur avant de builder.

### Repartir d'une base saine (`RuntimeError: Aborted()`)

Symptôme : `PgliteDb.create` échoue avec `RuntimeError: Aborted()`, y compris hors application, et
les pages répondent 500 tandis que `/api/health` renvoie 503.

```bash
# 1. arrêter le serveur (le verrou est libéré)
# 2. vérifier la dernière sauvegarde
ls -1 backups/ | tail -3
npm run db:restore -- --depuis backups/excellence360-AAAA... --yes --force   # conserve l'ancienne base
npm run db:migrate
ORGANIX_SEED_PASSWORD='…' npm run db:seed -- --force                   # si base de démonstration
rm -rf .data/pglite.avant-restauration-*                               # après contrôle
```
