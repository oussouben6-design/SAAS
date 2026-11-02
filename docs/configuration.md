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
| `MAIL_TRANSPORT` | `console` | `console` (journalise le lien), `none`, `smtp`, `resend` |
| `MAIL_FROM` | `ORGANIX <no-reply@organix.local>` | Expéditeur |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | — | **Non implémentés** : `smtp` lève une erreur explicite |
| `RESEND_API_KEY` | — | **Non implémenté** |

État réel : seul `console` fonctionne. Les liens d'invitation et de réinitialisation sont écrits
dans la console du serveur ; en production il faut brancher un transport (mission dédiée) ou copier
le lien manuellement.

## Stockage des documents

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `STORAGE_DRIVER` | `local` | `local` (fonctionne) ou `supabase` (non implémenté, erreur explicite) |
| `ORGANIX_STORAGE_DIR` | `.data/storage` | Répertoire privé des fichiers |
| `MAX_UPLOAD_BYTES` | `10485760` (10 Mio) | Taille maximale par fichier |

Le répertoire de stockage doit être **persistant et sauvegardé** (volume) : il n'est pas dans Git.
Un stockage objet (S3/Supabase Storage) est prévu en phase 5 ; les chemins sont déjà normalisés
(`<organisation>/<document>-<nom>`).

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
