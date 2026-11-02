# Configuration (variables d'environnement)

Copiez `.env.example` en `.env.local` pour le développement. En production, renseignez les mêmes
clés dans l'interface de votre hébergeur. **Aucune valeur secrète ne doit être commitée.**

## Base de données

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `DATABASE_MODE` | `pglite` (si `DATABASE_URL` absente) | `pglite` ou `postgres` |
| `DATABASE_URL` | — | Chaîne PostgreSQL (requise en mode `postgres`) |
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
| `APP_URL` | `http://localhost:3000` | URL publique des liens d'e-mail et redirections |
| `AUTH_ALLOW_REGISTRATION` | `true` | `false` = comptes créés uniquement par invitation |
| `AUTH_REQUIRE_EMAIL_VERIFICATION` | `false` | Exige une adresse vérifiée pour se connecter |
| `NODE_ENV` | — | `production` active le cookie `Secure` |

### Comportements liés

- `AUTH_ALLOW_REGISTRATION=false` ferme `/inscription` ; les invitations restent possibles.
- `AUTH_REQUIRE_EMAIL_VERIFICATION=true` sans transport d'e-mail réel bloque les connexions : ne
  l'activez que lorsque `MAIL_TRANSPORT` est opérationnel.
- Les sessions sont stockées en base (jeton aléatoire haché, cookie `organix_session`
  `httpOnly` + `SameSite=Lax`). Aucune clé de signature n'est nécessaire.

## E-mails

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `MAIL_TRANSPORT` | `console` | `console` (journalise le lien), `none`, `resend` (envoi réel), `smtp` (non implémenté) |
| `MAIL_FROM` | — | Expéditeur vérifié (ex. `ORGANIX <no-reply@votre-domaine>`), requis pour `resend` |
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
ORGANIX qui vérifie les permissions `documents:read`). **Non vérifié contre un projet Supabase réel**
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
