# Configuration (variables d'environnement)

Copiez `.env.example` en `.env.local` pour le développement. En production, renseignez les mêmes
clés dans l'interface de votre hébergeur. **Aucune valeur secrète ne doit être commitée.**

## Base de données

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `DATABASE_MODE` | `pglite` (si `DATABASE_URL` absente) | `pglite` ou `postgres` |
| `DATABASE_URL` | — | Chaîne PostgreSQL (requise en mode `postgres`). **Supabase : pooler port 6543** (IPv4), format `postgresql://postgres.<ref>:<mdp>@aws-0-<région>.pooler.supabase.com:6543/postgres` |
| `DATABASE_POOL_MAX` | `5` | Taille du pool de connexions (2 à 3 suffisent derrière un pooler) |
| `DATABASE_SSL` | `true` | TLS vers PostgreSQL ; `false` seulement en local |
| `AUTO_MIGRATE` | `false` | Applique les migrations au démarrage (CI / production) |
| `ORGANIX_DATA_DIR` | `.data/pglite` | Répertoire PGlite (ignoré par Git) |

Les migrations se trouvent dans `supabase/migrations` et s'appliquent dans l'ordre alphabétique.
Elles sont écrites pour être **idempotentes** (`create table if not exists`, `drop policy if exists`
avant `create policy`). Ne modifiez jamais une migration déjà appliquée en production : ajoutez-en
une nouvelle.

## Application

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `APP_URL` | `http://localhost:3000` | URL publique des liens d'e-mail et redirections ; sur Vercel, `VERCEL_PROJECT_PRODUCTION_URL`/`VERCEL_URL` (production/preview) sont utilisées si absente — sur Netlify, `URL`/`DEPLOY_PRIME_URL` |
| `AUTH_ALLOW_REGISTRATION` | `true` | `false` = comptes créés uniquement par invitation |
| `AUTH_REQUIRE_EMAIL_VERIFICATION` | `false` | Exige une adresse vérifiée pour se connecter |
| `AUTH_LOGIN_OTP` | `true` | Code à 6 chiffres envoyé par e-mail **à chaque connexion par mot de passe**, exigé avant l'ouverture de session ; `false` pour désactiver (dernier recours) |
| `AUTH_LOGIN_OTP_GOOGLE` | `false` | `true` = le code e-mail est aussi exigé après une connexion Google ; `false` (défaut) = Google vérifie l'adresse tout seul, la connexion est « en un clic » |
| `GOOGLE_CLIENT_ID` | — (connexion Google désactivée) | ID client OAuth Google (« Application Web ») — voir ci-dessous |
| `GOOGLE_CLIENT_SECRET` | — | Secret associé ; les deux variables doivent être définies ensemble |
| `NODE_ENV` | — | `production` active le cookie `Secure` |

### Comportements liés

- `AUTH_ALLOW_REGISTRATION=false` ferme `/inscription` ; les invitations restent possibles.
- `AUTH_REQUIRE_EMAIL_VERIFICATION=true` sans transport d'e-mail réel bloque les connexions : ne
  l'activez que lorsque `MAIL_TRANSPORT` est opérationnel.
- `AUTH_LOGIN_OTP` est **actif par défaut** : après le mot de passe (et après la 2FA le cas échéant),
  aucune session n'est ouverte tant que le code à 6 chiffres envoyé par e-mail n'est pas saisi
  (défi à usage unique, 10 minutes de validité, 5 essais, empreinte scrypt en base, jamais le code
  en clair). En développement (`MAIL_TRANSPORT=console`), aucun e-mail ne part : le code est affiché
  à l'écran après connexion. En production, `npm run env:check` **refuse le déploiement** si l'OTP
  est actif sans transport réel (`MAIL_TRANSPORT=console` ou `smtp`) : configurez Resend, ou posez
  `AUTH_LOGIN_OTP=false` temporairement. La désactivation rend la connexion possible avec le seul
  mot de passe (la 2FA TOTP éventuelle reste exigée) — à réserver aux incidents.
- **Après une connexion Google**, le code e-mail **n'est pas exigé par défaut**
  (`AUTH_LOGIN_OTP_GOOGLE=false`) : le jeton d'identité Google, vérifié côté serveur (signature,
  audience, nonce, `email_verified`), prouve la propriété de l'adresse — c'est la vérification
  « en un clic ». Si le compte a la double authentification TOTP active, elle reste demandée.
  `AUTH_LOGIN_OTP_GOOGLE=true` rétablit le code e-mail après Google également.
- Les sessions sont stockées en base (jeton aléatoire haché, cookie `organix_session`
  `httpOnly` + `SameSite=Lax`). Aucune clé de signature n'est nécessaire.

### Activer « Se connecter avec Google »

1. Ouvrez la [console Google Cloud](https://console.cloud.google.com/) (compte Google gratuit)
   et créez ou sélectionnez un projet.
2. **APIs et services → Écran de consentement OAuth** : type « Externe », nom de l'application
   « Excellence 360 CRM », e-mail d'assistance. Aucune portée sensible n'est demandée
   (`openid`, `email`, `profile`) : pas de validation Google nécessaire au-delà de la publication
   de l'écran de consentement (en mode « Test », seuls les utilisateurs de test déclarés peuvent
   se connecter — passez l'application en « Production » pour l'ouvrir à tous).
3. **APIs et services → Identifiants → Créer des identifiants → ID client OAuth**,
   type **Application Web** :
   - Origines JavaScript autorisées : votre `APP_URL` (ex. `http://localhost:3000`) ;
   - **URI de redirection autorisés** : `<APP_URL>/api/auth/google/callback` — un par
     environnement, par exemple `http://localhost:3000/api/auth/google/callback` en
     développement et `https://crm.exemple.com/api/auth/google/callback` en production.
     L'orthographe doit être strictement identique, sinon Google refuse (`redirect_uri_mismatch`).
4. Copiez **ID client** et **secret client** dans `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
   (fichier `.env.local` en local, variables de l'hébergeur en production), puis redémarrez.
5. Contrôlez avec `npm run env:check` : il affiche l'URI de redirection exacte de
   l'environnement courant.

Comportement : le bouton « Continuer avec Google » n'apparaît que si les deux variables sont
définies, et il est affiché **en premier** sur la page de connexion (avant le formulaire). Un
premier passage avec un e-mail déjà connu **lie** le compte existant (l'adresse est marquée
vérifiée) ; sinon un compte sans mot de passe est créé — sauf si `AUTH_ALLOW_REGISTRATION=false`.
La connexion via Google ouvre directement la session (vérification « en un clic ») ; la double
authentification TOTP éventuelle reste demandée après Google, comme après un mot de passe.
Détails de sécurité : [`docs/securite.md`](securite.md).

## E-mails

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `MAIL_TRANSPORT` | `console` | `console` (journalise le lien), `none`, `resend` (envoi réel), `smtp` (non implémenté) |
| `MAIL_FROM` | — | Expéditeur vérifié (ex. `Excellence 360 CRM <no-reply@votre-domaine>`), requis pour `resend` |
| `RESEND_API_KEY` | — | Clé API Resend, requise pour `resend` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | — | **Non implémenté** : `smtp` renvoie un avertissement explicite |

État réel :
- `console` : les liens d'invitation, de vérification et de réinitialisation sont journalisés côté
  serveur (et affichés dans l'interface en développement). Aucun e-mail n'est envoyé.
- `resend` : appel HTTP direct à `https://api.resend.com/emails` (aucun SDK). Le plan gratuit
  Resend (3 000 e-mails/mois) suffit pour une petite organisation. **Non vérifié contre un compte
  réel** dans cet environnement (pas de clé, pas de réseau sortant vers Resend) : la forme de la
  requête est couverte par des tests unitaires avec `fetch` simulé.
- En cas d'échec (clé absente, HTTP 4xx/5xx, réseau), `sendMail` renvoie `delivered: false` et un
  message d'erreur réel : l'application n'affiche **jamais** un faux succès d'envoi.

Procédure d'activation : créer un compte Resend, vérifier le domaine d'envoi, renseigner
`RESEND_API_KEY` et `MAIL_FROM`, puis `MAIL_TRANSPORT=resend`. Activer ensuite
`AUTH_REQUIRE_EMAIL_VERIFICATION=true` si la vérification d'adresse est souhaitée.

## Supabase (offre gratuite)

- **Pooler obligatoire** : la connexion directe (`db.<ref>.supabase.co:5432`) est IPv6 uniquement.
  Utilisez le *Transaction pooler* (port 6543).
- **Rôle de connexion `postgres`** : il possède `BYPASSRLS` et `CREATEROLE`, ce qui permet au
  service d'authentification de lire les tables sans politique et aux migrations de créer le rôle
  `organix_app`. La migration `0012` autorise explicitement `set local role organix_app`
  (PostgreSQL 16+ exige l'option `SET`).
- **Rôles `anon` / `authenticated`** : la migration `0013` leur retire tout privilège sur `public`
  et `app`, afin qu'aucune donnée ne soit accessible via l'API PostgREST générée par Supabase.
- **Storage** : bucket `documents` **privé**, `STORAGE_DRIVER=supabase`, `SUPABASE_URL` et
  `SUPABASE_SERVICE_ROLE_KEY` (serveur uniquement, jamais `NEXT_PUBLIC_*`).
- **Pause du projet gratuit** : voir `docs/supabase.md` §7 (pg_cron ou supervision HTTP sur
  `/api/health`).

## Maintenance planifiée

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `MAINTENANCE_SECRET` | — (route désactivée) | Jeton protégeant `POST /api/maintenance` (purge des sessions expirées). En-tête `Authorization: Bearer <secret>` ou `?token=`. Sans valeur, la route répond 503. |

Exemple d'appel planifié (GitHub Actions, cron-job.org) :

```bash
curl -fsS -X POST -H "Authorization: Bearer $MAINTENANCE_SECRET" https://votre-domaine/api/maintenance
```

## Double authentification

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `MFA_ENCRYPTION_KEY` | — (fonctionnalité désactivée) | Clé **AES-256-GCM** de 32 octets en base64 qui chiffre les secrets TOTP avant stockage. Générer avec `openssl rand -base64 32`. |

- Absente ou invalide : l'écran `Paramètres → Sécurité` refuse l'activation avec un message explicite
  (aucun secret n'est jamais stocké en clair).
- **Changer cette clé rend les secrets existants indéchiffrables** : les utilisateurs concernés doivent
  réenregistrer leur application d'authentification (désactivation puis réactivation).
- Cette clé doit être sauvegardée dans le même coffre-fort que `DATABASE_URL`. Une sauvegarde de la base
  sans cette clé ne permet pas de restaurer la 2FA des utilisateurs ; en revanche les mots de passe
  restent valides (scrypt, non dépendant de cette clé).

## Stockage des documents

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `STORAGE_DRIVER` | `local` | `local` (disque privé) ou `supabase` (bucket privé via API REST) |
| `ORGANIX_STORAGE_DIR` | `.data/storage` | Répertoire privé des fichiers (mode `local`) |
| `SUPABASE_URL` | — | URL du projet Supabase, requis pour le mode `supabase` |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Clé service_role (serveur uniquement), requis pour `supabase` |
| `SUPABASE_STORAGE_BUCKET` | `documents` | Bucket **privé** à créer dans Supabase Storage |
| `MAX_UPLOAD_BYTES` | `10485760` (10 Mio) | Taille maximale par fichier |

Mode `local` : le répertoire doit être **persistant et sauvegardé** (volume) ; il n'est pas dans Git.
Les chemins sont normalisés (`<organisation>/<document>-<nom>`) et toute tentative de sortie du
répertoire est refusée.

Mode `supabase` : les fichiers sont écrits, lus et supprimés via l'API REST de Storage avec la clé
service_role ; le bucket reste **privé** (aucune URL publique, la lecture passe par le serveur
Excellence 360 CRM qui vérifie les permissions `documents:read`). **Non vérifié contre un projet Supabase réel**
dans cet environnement (pas de réseau sortant) : la requête est couverte par des tests unitaires avec
`fetch` simulé. Toute erreur (HTTP, configuration incomplète) est remontée à l'utilisateur.

## Assistant IA (facultatif, non développé)

| Variable | Rôle |
| --- | --- |
| `OPENAI_API_KEY` | Présence signalée dans l'interface ; **aucun appel n'est effectué** |

L'intégration est explicitement hors périmètre de cette étape. Aucune donnée n'est envoyée à un
service tiers par le code actuel.

## Supabase (facultatif)

| Variable | Rôle |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Réservé à une future intégration Storage / Realtime |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé publique (exposition navigateur légitime) |
| `SUPABASE_SERVICE_ROLE_KEY` | Usage serveur uniquement — **ne jamais** exposer côté client |

Aucune de ces clés n'est nécessaire aujourd'hui : l'application parle à PostgreSQL directement
(côté serveur) et gère elle-même sessions, hachage et permissions.

## Variables de maintenance

| Variable | Rôle |
| --- | --- |
| `ORGANIX_SEED_PASSWORD` | Mot de passe des comptes de démonstration (≥ 12 caractères) |
| `ORGANIX_SEED_ALLOW_REMOTE` | `true` autorise `db:seed` sur une base distante (déconseillé) |

## Bonnes pratiques

1. Un fichier `.env.local` par environnement, jamais commité (déjà dans `.gitignore`).
2. Rotation des secrets : changer `DATABASE_URL` invalide les connexions en cours ; invalidez les
   sessions via `npm run db:status` puis en base (`update sessions set revoked_at = now();`).
3. Sauvegardez `.env.local` dans un coffre-fort (gestionnaire de mots de passe), pas dans le dépôt.
