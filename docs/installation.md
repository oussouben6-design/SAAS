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
git clone <votre-dépôt> organix
cd organix
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

## 4. Vérification après installation

```bash
npm run typecheck     # aucune erreur TypeScript
npm run lint          # aucune erreur ESLint
npm test              # tests unitaires + intégration (base PGlite temporaire)
npm run build         # build de production
npm run db:status     # 7/7 migrations, volumétrie
```

Puis, dans le navigateur : `/` (page publique), `/inscription`, `/connexion`, `/app` (tableau de
bord), `/app/parametres/equipe`, `/app/parametres/roles`.

## 5. Problèmes fréquents

| Symptôme | Cause probable | Solution |
| --- | --- | --- |
| `DATABASE_URL est absente` | `DATABASE_MODE=postgres` sans URL | Renseigner `DATABASE_URL` |
| `password authentication failed` | Mot de passe URL mal encodé | Encoder les caractères spéciaux (`@` → `%40`) |
| `relation "organizations" does not exist` | Migrations non appliquées | `npm run db:migrate` |
| `Cannot find module '@electric-sql/pglite'` | `npm install` incomplet | `rm -rf node_modules && npm install` |
| Le serveur démarre mais `/app` redirige vers `/connexion` | Session absente ou expirée | Se reconnecter ; vérifier l'horloge système |
| E-mail de vérification non reçu | `MAIL_TRANSPORT=console` | Le lien est affiché dans la console du serveur |
| `npm run db:reset` refuse | Base distante détectée | Procédure manuelle (voir ci-dessus) |
| Un script de maintenance échoue pendant que `npm run dev` tourne | PGlite n'accepte qu'un seul processus | Arrêter le serveur avant `db:seed`, `db:status`, `db:migrate` |
