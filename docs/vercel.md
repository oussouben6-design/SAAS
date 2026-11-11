# Déploiement sur Vercel

Excellence 360 CRM est une application **Next.js 15** (App Router, Server Actions, route handlers) :
elle fonctionne sur Vercel sans configuration spécifique — le framework est détecté automatiquement
(build `next build`, Node ≥ 20.9, Node 22 recommandé). Ce guide est l'équivalent Vercel de
[`docs/netlify.md`](netlify.md) ; la base et le stockage passent par **Supabase** (gratuit), comme
pour Netlify.

⚠️ Plateforme **serverless** : ni disque persistant ni base embarquée. `DATABASE_MODE=pglite` et
`STORAGE_DRIVER=local` sont refusés au build et au démarrage (`src/lib/config/platform.ts`) — aucune
perte silencieuse de données.

## 1. Préparer Supabase (une fois)

Comme pour Netlify (`docs/supabase.md`) : projet créé, schéma appliqué (`npm run db:migrate` avec
`DATABASE_MODE=postgres` et `DATABASE_URL` sur le **pooler port 6543**), bucket privé `documents`,
compte réel via `npm run admin:create` (jamais `db:seed` en production). Les 25 migrations sont déjà
appliquées et vérifiées en production Supabase (11 nov. 2026, voir `PROJECT_STATUS.md`).

## 2. Importer le projet dans Vercel

1. [vercel.com](https://vercel.com) → **Add New… → Project** → le dépôt `oussouben6-design/SAAS`.
2. Framework preset : **Next.js** (détecté). Build command et output : valeurs par défaut — ne pas
   y toucher. La configuration (`env:check`) est appliquée **avant** le déploiement, via la CI
   GitHub (préflights Netlify **et** Vercel sur chaque push/PR) et via `npm run env:check` en local.
3. **Node.js Version** (Settings → General) : **22.x** (comme la CI).

## 3. Variables d'environnement (Settings → Environment Variables)

Portées **Production** et **Preview** (les previews sans secrets sont refusées par le garde-fou, à
dessein). Valeurs d'après `docs/configuration.md` :

| Variable | Valeur / origine |
| --- | --- |
| `DATABASE_MODE` | `postgres` |
| `DATABASE_URL` | Supabase → Project Settings → Database → **Session pooler**, port 6543 (le port 5432 / l'hôte direct est IPv6, injoignable) |
| `DATABASE_POOL_MAX` | `2` (chaque instance serverless a son propre pool) |
| `DATABASE_SSL` | `true` |
| `AUTO_MIGRATE` | `false` (le schéma est déjà appliqué ; lancer `db:migrate` hors du build) |
| `STORAGE_DRIVER` | `supabase` |
| `SUPABASE_URL` | `https://<réf>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | clé **service_role** (jamais de préfixe `NEXT_PUBLIC_`) |
| `SUPABASE_STORAGE_BUCKET` | `documents` (privé) |
| `MAX_UPLOAD_BYTES` | `4194304` (**4 Mo** — la limite de corps de requête des fonctions Vercel est ~4,5 Mo ; 5 Mo fonctionnerait en théorie mais serait refusé dès qu'un envoi dépasse la plateforme) |
| `MAIL_TRANSPORT` | `resend` (+ `RESEND_API_KEY`, `MAIL_FROM` vérifié) — **requis** tant que `AUTH_LOGIN_OTP` est actif (défaut) |
| `AUTH_LOGIN_OTP` | `true` une fois Resend opérationnel ; `false` uniquement en dernier recours |
| `AUTH_LOGIN_OTP_GOOGLE` | `false` (défaut) : connexion Google en un clic ; `true` pour exiger aussi le code e-mail après Google |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Client OAuth Google « Application Web » — l'URI de redirection `https://<votre-domaine>/api/auth/google/callback` doit y être déclarée (voir §5) |
| `MFA_ENCRYPTION_KEY` | `openssl rand -base64 32` |
| `MAINTENANCE_SECRET` | `openssl rand -hex 32` |
| `AUTH_ALLOW_REGISTRATION` | `false` recommandé (comptes sur invitation) |
| `APP_URL` | **Facultative** : `VERCEL_PROJECT_PRODUCTION_URL` est utilisée automatiquement en production (`VERCEL_URL` sur les previews). Définissez-la explicitement si vous utilisez un domaine personnalisé — et dans tous les cas, l'URI Google déclarée doit correspondre au domaine réel des liens. |

Après tout ajout/modification : **Redeploy** (les variables posées pendant un build ne s'y
appliquent pas).

## 4. Vérifier après le déploiement

```bash
npm run smoke -- --url https://<votre-domaine>
# si l'OTP est actif : la connexion exige le code reçu — utilisez --otp-code 123456
# ou injectez un jeton avec --token
```

`GET https://<votre-domaine>/api/health` doit répondre `{"status":"ok", … 25/25 migrations …}`.
`npm run env:check` en local affiche la plateforme détectée (`vercel`), l'URL publique résolue et
chaque variable manquante avec son lieu de saisie — sans jamais imprimer de valeur.

## 5. Connexion Google sur le domaine de production

Ajoutez au **même** client OAuth Google (Identifiants → votre client → « URI de redirection
autorisés ») : `https://<votre-domaine>/api/auth/google/callback` (en plus de
`http://localhost:3000/api/auth/google/callback` pour le développement). Les previews Vercel ont
des URL changeantes : testez Google sur le domaine fixe de production, pas sur les previews.

## 6. Maintenance planifiée (cron de purge)

GitHub Actions (`.github/workflows/cron.yml`) fonctionne quel que soit l'hébergeur : définissez les
secrets du dépôt `APP_URL` (`https://<votre-domaine>`) et `MAINTENANCE_SECRET` — la purge nocturne
et la sonde `/api/health` tourneront sans Vercel Cron. (Vercel Cron est possible, mais exige une
adaptation de la route ; inutile ici.)

## 7. Limites connues propres à Vercel

- **Corps de requête ~4,5 Mo** : d'où `MAX_UPLOAD_BYTES=4194304`. Les documents plus gros
  échoueront à l'envoi (bouton accepté mais échec serveur) — c'est volontaire, une erreur lisible
  plutôt qu'un paiement évitable.
- **Plan Hobby** : usage non commercial et limites d'exécution/bande passante ; vérifiez les
  conditions du moment avant d'ouvrir l'accès utilisateurs.
- **Previews sans secrets** : les déploiements de branche/PR n'ont pas les variables de production ;
  la connexion réelle (base, e-mails) n'y fonctionnera pas — c'est voulu. Utilisez la CI GitHub
  (déjà verte) comme référence de build pour les PR.
- **Non encore validé contre un projet Vercel réel** dans cet environnement : la configuration est
  vérifiée statiquement (préflight Vercel factice dans la CI + tests unitaires) ; le déploiement
  réel vous appartient. Faites un tour complet (connexion, téléversement d'un PDF, invitation avec
  e-mail Resend) avant d'ouvrir l'accès.
