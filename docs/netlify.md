# Déploiement sur Netlify

> **Vous hébergez sur Vercel ?** Le guide équivalent est [`docs/vercel.md`](vercel.md) (le dépôt
> dispose d'un préflight Vercel dédié dans la CI et de la résolution automatique de l'URL publique
> Vercel dans `env:check`). Ce document reste valable pour Netlify.

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
   pooler → `npm run db:status` doit afficher **25/25 migrations** et
   « Bascule de rôle applicatif : OK ».
3. Bucket `documents` créé, **privé**. Sa limite côté Supabase peut rester à 10 Mo : c'est
   `MAX_UPLOAD_BYTES=5242880` (5 Mo, déjà dans `netlify.toml`) qui borne réellement l'envoi,
   la fonction serverless refusant tout corps de requête au-delà d'environ 6 Mo.
4. Compte réel créé : `npm run admin:create -- --email … --name … --org …`
   (ne **jamais** lancer `npm run db:seed` en production : le jeu de démonstration est fictif).

## 2. Connecter le dépôt à Netlify

1. [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project**.
2. Choisir **GitHub**, autoriser, sélectionner le dépôt `oussouben6-design/SAAS`, branche `main`.
3. Netlify lit **`netlify.toml`** : commande de build
   `npm run env:check && npm run build`, publication `.next`, Node 22. Laisser les champs vides
   (ils sont déjà définis) et cliquer sur **Deploy**. Le `env:check` ne s'applique qu'aux
   déploiements de **production** : les aperçus (`deploy-preview`, `branch-deploy`) lancent
   `npm run build` seul, parce qu'ils n'ont pas à porter les secrets du site. `next build` est
   vérifié sans aucune variable (build complet, code 0) et la CI continue de contrôler la logique
   d'`env:check` avec des valeurs factices.
4. Le build échoue volontairement si la configuration d'environnement est incomplète
   (`npm run env:check`, première étape de la commande de build) : le message liste chaque
   variable manquante, où la renseigner et d'où tirer sa valeur, sans jamais afficher de secret.
   C'est normal au premier essai : il n'y a rien à corriger dans le dépôt quand le build échoue
   ainsi. Voir le § 3.1 si les variables sont déjà saisies.

### 2.1 Un seul site Netlify par dépôt (sinon : variables introuvables et checks rouges)

Chaque **import** du dépôt crée un site Netlify *distinct*, avec **son propre jeu de variables
d'environnement** : les saisir sur l'un ne les apporte pas aux autres. Ce dépôt a déjà été importé
plusieurs fois — Netlify construit le même code depuis cinq sites, ce qui produit deux effets
trompeurs :

- le site que l'on configure n'est pas forcément celui dont on lit le log, d'où un « j'ai pourtant
  mis la variable » qui ne se débloque jamais ;
- chaque pull request déclenche cinq builds d'aperçu, donc cinq séries de checks
  `Pages changed` / `Header rules` / `Redirect rules` en échec tant que le préflight refusait.

À faire une fois : garder **le** site dont *Site configuration → Build & deployment → Branches and
deploy contexts* déclare `main` comme *production branch*, puis **Destroy site** (Danger zone) sur les
autres. Si aucun ne le déclare, en créer un seul et détruire les cinq. Les checks Netlify d'une pull
request ne bloquent pas la fusion : `mergeStateStatus: UNSTABLE` avec une CI `SUCCESS` veut dire
qu'un ou plusieurs aperçus n'ont pas pu construire, rien de plus.

## 3. Variables d'environnement (Site configuration → Environment variables)

À renseigner avant le premier déploiement **de production** : les aperçus n'en ont pas besoin
(§ 2.1 et `netlify.toml`), et une variable saisie sur un autre site du même dépôt n'a aucun effet ici (§ 2.1). Utiliser **des valeurs `production`** et cocher
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
| `AUTH_LOGIN_OTP` | `true` (défaut) une fois Resend configuré | `false` uniquement en dernier recours : sinon personne ne peut se connecter sans le code envoyé par e-mail. Ne s'applique pas à Google (voir `AUTH_LOGIN_OTP_GOOGLE`) |
| `AUTH_LOGIN_OTP_GOOGLE` | `false` (défaut) | `true` pour exiger aussi le code e-mail après une connexion Google ; `false` = connexion Google « en un clic » |

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

### 3.1 Portée des variables : les trois pièges qui font échouer le build

Un `env:check` en échec **après** saisie des variables vient presque toujours de l'une de ces trois
causes — jamais d'une valeur fausse, puisque le blocage intervient avant que l'application ne se
connecte :

1. **Portée.** Une variable doit être visible des **builds** et des **fonctions**. Limitée aux seules
   fonctions, elle reste invisible à `npm run env:check`, exécuté pendant le build : le contrôle la
   déclare absente alors qu'elle existe bien sur le site.
2. **Moment.** Les variables ajoutées pendant qu'un build est déjà lancé (ou en file) ne lui sont pas
   appliquées. Après toute modification : **Deploys → Trigger deploy → Clear cache and deploy site**.
   Le « Failed to fetch cache » du log est bénin ; vider le cache lève surtout le doute sur les
   dépendances.
3. **Site, pas équipe.** Une variable définie seulement au niveau de l'équipe Netlify n'est pas
   reprise par le site, et les secrets des **GitHub Actions** de `.github/workflows/cron.yml` ne sont
   **pas** transmis à Netlify : chaque site Netlify doit recevoir les siens.

Pour savoir quels noms ont réellement atteint le build, lire le bloc
`Resolved config → build: environment` du log Netlify : il liste les **noms** injectés, jamais les
valeurs. Les noms du `netlify.toml` (`DATABASE_MODE`, `STORAGE_DRIVER`, `SUPABASE_STORAGE_BUCKET`,
`MAX_UPLOAD_BYTES`…) y figurent toujours ; vos secrets n'y figurent que si Netlify les a réellement
fournis. C'est le moyen le plus rapide de trancher entre « pas saisie », « mauvaise portée » et
« ajout trop tard », sans exposer aucune valeur.

## 4. Après le premier déploiement

```bash
curl -s https://votre-site.netlify.app/api/health
# {"status":"ok","driver":"postgres","migrations":{"applied":23,"available":23},…}

npm run smoke -- --url https://votre-site.netlify.app \
                  --email vous@votre-organisation.com --password '…'
# 20/20 contrôles réussis
```

Contrôles manuels indispensables :

1. Créer le compte réel. Deux voies : `npm run admin:create -- --email … --name … --org …`
   (nécessite `DATABASE_URL` en local, donc le mot de passe de base), ou, plus simple pour ce
   premier compte, **`/inscription` en ligne** : `AUTH_ALLOW_REGISTRATION` est ouverte par défaut.
   Définir ensuite `AUTH_ALLOW_REGISTRATION=false` dans Netlify et redéployer pour réserver
   l'accès sur invitation. Vérifier alors l'absence de bandeau de démonstration (la base est vide :
   `profiles` et `auth.users` étaient à 0 avant ce premier compte).
2. **Documents** : téléverser un fichier (< 5 Mo), le télécharger, vérifier dans
   *Supabase → Storage → documents* que l'objet existe et que le bucket reste **privé**.
3. **Notifications en direct** : ouvrir deux onglets connectés du même compte, créer une
   notification dans l'un (affectation de tâche) et contrôler l'apparition dans l'autre. Côté
   base, le débit réel se vérifie ainsi : `select slot_name, active from
   pg_replication_slots;` doit montrer un slot **actif** pendant qu'un onglet est abonné. Un
   projet jamais ouvert depuis l'extérieur n'a aucun slot : ce n'est pas une panne, c'est
   l'absence d'abonné (la publication `supabase_realtime` contient bien `notifications`,
   `wal_level` est `logical`).
4. **2FA** : activer depuis `Paramètres → Sécurité`, se déconnecter, se reconnecter avec un code.
5. `/api/maintenance` sans jeton → **401** ; avec `MAINTENANCE_SECRET` → **200**. La route appelle
   `cleanupExpiredAuthRecords()` : sessions expirées et jetons d'action périmés, aucune donnée
   métier. C'est le seul garde-fou contre la croissance de `sessions` ; `pg_cron` n'est **pas**
   installé sur le projet et n'est pas nécessaire ici (détail : `docs/supabase.md` § 7).

## 5. Domaine personnalisé et HTTPS

Avant de tester le domaine, vérifier que le site est **public** : *Site configuration → Access control → Site protection* sur **Public**. Un site laissé sous protection d'équipe répond
« This site is private — Sign in with an invited Netlify account » à vos utilisateurs, y compris
après un déploiement vert : Excellence 360 CRM a sa propre authentification (mots de passe scrypt,
sessions en base, révocation, 2FA) et ses en-têtes CSP/HSTS — un second verrou devant l'application
n'apporte rien et réserve le site aux seuls comptes Netlify invités.

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
| Build : « ERREURS bloquantes » | Variable manquante (`npm run env:check`) | Renseigner les variables listées dans le bloc « À définir » du log, puis redéployer |
| Le site répond « This site is private » | Protection d'accès Netlify activée sur le site ou l'équipe | *Site configuration → Access control* → Public (l'app authentifie elle-même ; voir § 5) |
| `<slug>.netlify.app` → « Site not found » (404) alors que les aperçus se construisent | Aucun déploiement de production sur ce site : seuls les *deploy previews* existent | Créer le déploiement de production (`main`) sur le site retenu, ou basculer *production branch* sur `main` (§ 2.1) |
| Aperçu déployé mais pages en erreur de configuration | Volontaire : `netlify.toml` ne passe les secrets qu'en production, et `src/lib/db` lève « DATABASE_MODE=postgres mais DATABASE_URL est absente » | Aucun correctif ; pour des aperçus fonctionnels, il faudrait une base de préproduction séparée et ses propres variables |
| Cinq sites construisent la même pull request, checks rouges persistants | Dépôt importé plusieurs fois dans Netlify : chaque site a ses propres variables | § 2.1 — garder le site `main` en production, détruire les autres |
| Build de production refusé **alors que** les variables sont saisies | Portée ne couvrant pas les builds, variables ajoutées après le lancement du build, ou saisies sur un autre site du dépôt | § 3.1 : vérifier le bloc « Resolved config » du log, puis « Clear cache and deploy site » |
| Build réussi mais téléversement en échec | `SUPABASE_SERVICE_ROLE_KEY` = clé `anon` | Remettre la véritable clé `service_role` : le contrôle de build vérifie la présence, pas la nature de la clé |
| Notifications jamais reçues en direct | Aucun abonné Realtime (aucun slot de réplication), ou réplication non activée côté projet | Activer Realtime/réplication côté Supabase ; à défaut, les notifications restent lues au rechargement de page |
| 500 « Base PGlite impossible sur une plateforme serverless » | `DATABASE_MODE` absent ou `pglite` | Mettre `postgres` + `DATABASE_URL` (pooler) |
| 500 « Stockage local impossible… » | `STORAGE_DRIVER=local` | Mettre `supabase` + clés Supabase |
| `42501 permission denied to set role "organix_app"` | Migrations appliquées sans la 0012, ou par un rôle non propriétaire | `npm run db:migrate` avec l'utilisateur `postgres` ; `npm run db:status` doit afficher « Bascule de rôle applicatif : OK » |
| `ENETUNREACH` / timeout base | `DATABASE_URL` sur la connexion directe (IPv6) | Utiliser le pooler `…pooler.supabase.com:6543` |
| Échec de connexion aléatoire (`too many connections`) | `DATABASE_POOL_MAX` trop élevé | `2` derrière le pooler |
| `/api/health` → 503 | Projet Supabase en pause, ou base injoignable | Restaurer le projet (Supabase), vérifier le keep-alive |
| Aucun e-mail reçu | `MAIL_TRANSPORT=console` | Configurer Resend + `MAIL_FROM` |

## 10. Checklist de mise en service

- [ ] Migrations appliquées (25/25) et `db:status` : bascule de rôle **OK**, 50/50 RLS forcée
- [ ] Compte propriétaire réel créé (`admin:create`) ; aucun `db:seed` en production
- [ ] Variables d'environnement complètes (`npm run env:check` sans erreur) **et** de portée build +
      fonctions (§ 3.1), vérifiées dans le bloc « Resolved config » du log de build
- [ ] `MAX_UPLOAD_BYTES=5242880` (limite Netlify)
- [ ] Bucket `documents` privé + test réel d'upload/téléchargement
- [ ] `/api/health` → `ok` ; `npm run smoke -- --url …` → 20/20
- [ ] Domaine + HTTPS actifs, `APP_URL` à jour
- [ ] Secrets GitHub `APP_URL` / `MAINTENANCE_SECRET` posés (keep-alive + purge)
- [ ] Sauvegarde `pg_dump` planifiée et restauration testée
- [ ] 2FA activée pour le compte propriétaire
