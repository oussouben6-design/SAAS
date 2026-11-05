# Déploiement sur Netlify

Excellence 360 CRM est une application **Next.js 15** (App Router, Server Actions, route handlers) : elle
fonctionne sur Netlify via le runtime officiel `@netlify/plugin-nextjs`, détecté automatiquement.

Netlify est une plateforme **serverless** : elle ne fournit ni disque persistant, ni base embarquée.
Deux services externes sont donc obligatoires, et ils sont **gratuits** :

| Besoin | Solution retenue | Coût |
| --- | --- | --- |
| Base PostgreSQL | **Supabase** (pooler, port 6543) | Gratuit (500 Mo) |
| Fichiers (documents) | **Supabase Storage**, bucket privé `documents` | Gratuit (1 Go) |

Voir [`docs/supabase.md`](supabase.md) pour la création du projet, le pooler et le bucket.
Les réglages `DATABASE_MODE=pglite` et `STORAGE_DRIVER=local` **ne fonctionnent pas** sur Netlify :
l'application refuse explicitement de démarrer dans ce cas
(`src/lib/config/platform.ts`) — aucune perte silencieuse de fichiers.

## 1. Préparer Supabase (une fois)

1. Projet Supabase créé, mot de passe de base enregistré (`docs/supabase.md` §2-3).
2. Schéma appliqué : `npm run db:migrate` avec `DATABASE_MODE=postgres` et `DATABASE_URL` sur le
   pooler → `npm run db:status` doit afficher **14/14 migrations** et
   « Bascule de rôle applicatif : OK ».
3. Bucket `documents` créé, **privé**, limite 10 Mo.
4. Compte réel créé : `npm run admin:create -- --email … --name … --org …`
   (ne **jamais** lancer `npm run db:seed` en production : le jeu de démonstration est fictif).

## 2. Connecter le dépôt à Netlify

1. [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project**.
2. Choisir **GitHub**, autoriser, sélectionner le dépôt `oussouben6-design/SAAS`, branche `main`.
3. Netlify lit **`netlify.toml`** : commande de build
   `npm run env:check && npm run build`, publication `.next`, Node 22.
   Laisser les champs vides (ils sont déjà définis) et cliquer sur **Deploy**.
4. Le build échoue volontairement si la configuration d'environnement est incomplète
   (`npm run env:check`) : le message indique précisément la variable manquante. C'est normal au
   premier essai.

## 3. Variables d'environnement (Site configuration → Environment variables)

À renseigner avant le premier déploiement réussi. Utiliser **des valeurs `production`** et cocher
*Contains secret values* pour les clés. **Les secrets GitHub Actions ne sont pas transmis à Netlify** :
ils doivent être définis dans chaque site Netlify (ou via l'API/CLI Netlify). Les valeurs non sensibles
`DATABASE_POOL_MAX=2`, `AUTO_MIGRATE=false`, `SUPABASE_STORAGE_BUCKET=documents` et
`MAX_UPLOAD_BYTES=5242880` sont déjà dans `netlify.toml` ; `APP_URL` est déduite de l'URL Netlify si
elle est absente. Il reste donc au minimum trois variables à configurer : `DATABASE_URL`,
`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`.

| Variable | Exemple / valeur | Notes |
| --- | --- | --- |
| `DATABASE_MODE` | `postgres` | Obligatoire (déjà dans `netlify.toml` pour le build) |
| `DATABASE_URL` | `postgresql://postgres.<ref>:<mdp>@aws-0-eu-west-3.pooler.supabase.com:6543/postgres` | **Pooler** (IPv4) ; la connexion directe est IPv6 |
| `DATABASE_SSL` | `true` | |
| `DATABASE_POOL_MAX` | `2` | Chaque instance serverless crée son pool |
| `AUTO_MIGRATE` | `false` | Migrations hors runtime |
| `STORAGE_DRIVER` | `supabase` | Obligatoire (déjà dans `netlify.toml` pour le build) |
| `SUPABASE_URL` | `https://<ref>.supabase.co` | |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ…` | **Secret**, jamais `NEXT_PUBLIC_` |
| `SUPABASE_STORAGE_BUCKET` | `documents` | Bucket privé |
| `MAX_UPLOAD_BYTES` | `5242880` | **5 Mo** : les fonctions Netlify limitent le corps de requête (~6 Mo) |
| `APP_URL` | `https://votre-site.netlify.app` | Optionnel sur Netlify : `URL`/`DEPLOY_PRIME_URL` sont utilisées automatiquement ; à définir pour un domaine personnalisé |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | identifiants OAuth Google | Optionnels, à définir ensemble ; voir `docs/configuration.md` |
| `MFA_ENCRYPTION_KEY` | sortie de `openssl rand -base64 32` | Chiffre les secrets TOTP |
| `MAINTENANCE_SECRET` | sortie de `openssl rand -hex 32` | Protège `/api/maintenance` |
| `MAIL_TRANSPORT` | `resend` | `console` n'envoie rien en production |
| `RESEND_API_KEY` / `MAIL_FROM` | clé Resend + expéditeur vérifié | Gratuit (3 000 e-mails/mois) |
| `AUTH_ALLOW_REGISTRATION` | `true` (public) ou `false` (sur invitation) | |
| `AUTH_REQUIRE_EMAIL_VERIFICATION` | `true` seulement si Resend est configuré | Sinon les comptes resteraient bloqués |

Pour la connexion Google, déclarez aussi dans Google Cloud l'URI de redirection exacte
`<APP_URL>/api/auth/google/callback` (avec le domaine Netlify ou le domaine personnalisé), puis
testez une connexion réelle après le déploiement.

En ligne de commande (facultatif) :

```bash
npm i -g netlify-cli
netlify login
netlify link
netlify env:set DATABASE_URL "postgresql://…" --scope builds,functions
```

Puis **Deploys → Trigger deploy → Clear cache and deploy site**.

> **Vérifié** : `next build` réussit avec `DATABASE_MODE=postgres` et une base **injoignable**
> (toutes les pages authentifiées sont dynamiques). Le build Netlify ne dépend donc pas de la
> disponibilité de Supabase ; seul le runtime interroge la base.

## 4. Après le premier déploiement

```bash
curl -s https://votre-site.netlify.app/api/health
# {"status":"ok","driver":"postgres","migrations":{"applied":14,"available":14},…}

npm run smoke -- --url https://votre-site.netlify.app \
                  --email vous@votre-organisation.com --password '…'
# 20/20 contrôles réussis
```

Contrôles manuels indispensables :

1. Créer le compte réel (ou `admin:create`), se connecter, vérifier l'absence de bandeau de
   démonstration.
2. **Documents** : téléverser un fichier (< 5 Mo), le télécharger, vérifier dans
   *Supabase → Storage → documents* que l'objet existe et que le bucket reste **privé**.
3. **2FA** : activer depuis `Paramètres → Sécurité`, se déconnecter, se reconnecter avec un code.
4. `/api/maintenance` sans jeton → **401** ; avec `MAINTENANCE_SECRET` → **200**.

## 5. Domaine personnalisé et HTTPS

Site configuration → **Domain management → Add a domain** → suivre les enregistrements DNS
(A ou CNAME). Netlify provisionne automatiquement un certificat **Let's Encrypt** (gratuit).
Ensuite, mettre à jour `APP_URL` avec le domaine définitif et redéployer.

## 6. Maintenance planifiée (gratuite)

Le dépôt contient `.github/workflows/cron.yml` :

- toutes les 6 h : appel de `/api/health` (supervision + **keep-alive** du projet Supabase gratuit) ;
- chaque nuit : `POST /api/maintenance` (purge des sessions expirées).

À activer en ajoutant deux **secrets GitHub** (Settings → Secrets and variables → Actions) :
`APP_URL` et `MAINTENANCE_SECRET`. Sans eux, les étapes sont ignorées (aucun échec).
Alternative sans GitHub : Netlify **Scheduled Functions**, ou un service de cron gratuit
(cron-job.org) appelant la même URL avec l'en-tête `Authorization: Bearer <MAINTENANCE_SECRET>`.

## 7. Sauvegardes (Netlify n'en fournit pas)

- Base : `pg_dump "$DATABASE_URL" --no-owner --no-privileges -Fc -f excellence360-$(date +%F).dump`
  planifié sur une machine ou dans un workflow GitHub, copie **hors Supabase**.
- Fichiers : copie du bucket `documents` via l'API Storage (clé service_role).
- Test de restauration trimestriel : projet Supabase de test + `pg_restore` + `npm run db:status`.

## 8. Limites Netlify à connaître

| Limite (offre gratuite) | Valeur | Conséquence pour Excellence 360 CRM |
| --- | --- | --- |
| Durée d'une fonction synchrone | 10 s (jusqu'à 26 s selon l'offre) | Les exports volumineux et `db:backup` ne doivent pas passer par une requête HTTP |
| Corps de requête | ~6 Mo | `MAX_UPLOAD_BYTES=5242880` ; au-delà, prévoir un envoi direct vers Storage |
| Disque | Éphémère, non partagé | Interdit PGlite et le stockage local (refus explicite) |
| Exécution | Plusieurs instances en parallèle | La limitation de débit en mémoire est **par instance** (protection partielle) ; un limiteur persistant est recommandé avant une exposition publique forte |
| Démarrage à froid | Quelques centaines de ms | `/api/health` et le keep-alive réduisent la latence perçue |
| Bande passante | 100 Go/mois | Suffisant pour une application de gestion |

## 9. Dépannage

| Symptôme | Cause | Correction |
| --- | --- | --- |
| Build : « ERREURS bloquantes » | Variable manquante (`npm run env:check`) | Lire le message, renseigner la variable, redéployer |
| 500 « Base PGlite impossible sur une plateforme serverless » | `DATABASE_MODE` absent ou `pglite` | Mettre `postgres` + `DATABASE_URL` (pooler) |
| 500 « Stockage local impossible… » | `STORAGE_DRIVER=local` | Mettre `supabase` + clés Supabase |
| `42501 permission denied to set role "organix_app"` | Migrations appliquées sans la 0012, ou par un rôle non propriétaire | `npm run db:migrate` avec l'utilisateur `postgres` ; `npm run db:status` doit afficher « Bascule de rôle applicatif : OK » |
| `ENETUNREACH` / timeout base | `DATABASE_URL` sur la connexion directe (IPv6) | Utiliser le pooler `…pooler.supabase.com:6543` |
| Échec de connexion aléatoire (`too many connections`) | `DATABASE_POOL_MAX` trop élevé | `2` derrière le pooler |
| `/api/health` → 503 | Projet Supabase en pause, ou base injoignable | Restaurer le projet (Supabase), vérifier le keep-alive |
| Aucun e-mail reçu | `MAIL_TRANSPORT=console` | Configurer Resend + `MAIL_FROM` |

## 10. Checklist de mise en service

- [ ] Migrations appliquées (14/14) et `db:status` : bascule de rôle **OK**, 49/49 RLS forcée
- [ ] Compte propriétaire réel créé (`admin:create`) ; aucun `db:seed` en production
- [ ] Variables d'environnement complètes (`npm run env:check` sans erreur)
- [ ] `MAX_UPLOAD_BYTES=5242880` (limite Netlify)
- [ ] Bucket `documents` privé + test réel d'upload/téléchargement
- [ ] `/api/health` → `ok` ; `npm run smoke -- --url …` → 20/20
- [ ] Domaine + HTTPS actifs, `APP_URL` à jour
- [ ] Secrets GitHub `APP_URL` / `MAINTENANCE_SECRET` posés (keep-alive + purge)
- [ ] Sauvegarde `pg_dump` planifiée et restauration testée
- [ ] 2FA activée pour le compte propriétaire
