# Déploiement sur Supabase (offre gratuite)

Excellence 360 CRM utilise **PostgreSQL** et **Supabase Storage** : les mêmes migrations
(`supabase/migrations/*.sql`) s'appliquent en local (PGlite) et sur Supabase. Ce guide couvre
uniquement l'offre **gratuite** : aucun service payant n'est requis.

## 1. Ce que fournit l'offre gratuite

| Ressource | Offre gratuite | Usage Excellence 360 CRM |
| --- | --- | --- |
| Base PostgreSQL | 500 Mo | Données métier (largement suffisant pour une PME) |
| Storage privé | 1 Go | Documents (bucket `documents`, limite 10 Mo/fichier) |
| Egress | 5 Go/mois | Pages et documents ; pas de vidéo |
| Sauvegardes | Pas de PITR | `npm run db:backup` (pg_dump) planifié + copie hors Supabase |
| Mise en pause | Projet gratuit mis en pause après ~7 jours d'inactivité | Keep-alive (§7) |

Points de vigilance :
- **500 Mo** : purgez ou archivez les journaux d'audit anciens et les pièces jointes volumineuses.
  `npm run db:status` affiche la volumétrie, `npm run db:maintenance` purge sessions et jetons.
- **Pause** : un projet en pause répond par une erreur ; l'application affiche alors une erreur 503
  sur `/api/health`. Voir §7 pour l'éviter ou le réveiller.

## 2. Créer le projet

1. [supabase.com](https://supabase.com) → **New project**, région la plus proche (ici `eu-west-3`),
   mot de passe de base fort (conservez-le : c'est le seul accès administrateur).
2. Noter le **project ref** (ex. `opnlvqwbevnivfjpbrxa`).

## 3. Chaîne de connexion (pooler obligatoire)

Supabase → **Project Settings → Database → Connection string → Transaction pooler** :

```
postgresql://postgres.<ref>:<mot_de_passe>@aws-0-<région>.pooler.supabase.com:6543/postgres
```

- Le **pooler** écoute en IPv4 : la connexion directe (`db.<ref>.supabase.co:5432`) est IPv6
  uniquement et échoue sur la plupart des hébergeurs.
- Le rôle `postgres` de Supabase possède `BYPASSRLS` **et** `CREATEROLE` : il exécute les migrations
  et le service d'authentification, puis bascule en `set local role organix_app` pour chaque
  transaction métier. C'est ce qui garantit que la RLS s'applique réellement.

`.env.local` (ou variables d'environnement de l'hébergeur) :

```bash
DATABASE_MODE=postgres
DATABASE_URL="postgresql://postgres.<ref>:<mot_de_passe>@aws-0-<région>.pooler.supabase.com:6543/postgres"
DATABASE_SSL=true
DATABASE_POOL_MAX=3          # faible : le pooler mutualise déjà les connexions
AUTO_MIGRATE=false           # les migrations se lancent explicitement
```

## 4. Appliquer le schéma

```bash
npm run db:migrate     # applique 0001 → 0014 (idempotent)
npm run db:status      # doit afficher 23/23 migrations et « Bascule de rôle applicatif : OK »
```

La migration **0012** est indispensable sur Supabase : PostgreSQL 16 a dissocié les options
`ADMIN` / `INHERIT` / `SET`, et sans `grant organix_app to postgres with set true, inherit true`
chaque requête métier échoue en `42501: permission denied to set role "organix_app"`.
`npm run db:status` signale explicitement ce cas.

Ne lancez **pas** `npm run db:seed` en production : le jeu de démonstration est fictif. Pour le
premier administrateur réel :

```bash
npm run admin:create -- --email vous@votre-organisation.com --name "Prénom Nom" --org "Votre organisation"
```

## 5. Stockage des documents (bucket privé)

Bucket `documents`, **privé**, limite de 10 Mo par fichier. Création par SQL (ou via
*Storage → New bucket* dans le tableau de bord, en laissant « Public » décoché) :

```sql
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;
```

Variables :

```bash
STORAGE_DRIVER=supabase
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...      # Project Settings → API → service_role (serveur uniquement)
SUPABASE_STORAGE_BUCKET=documents
MAX_UPLOAD_BYTES=10485760
```

- La clé `service_role` **ne doit jamais** être exposée au navigateur (`NEXT_PUBLIC_*` interdit) ni
  commitée. Les fichiers sont servis par une route applicative qui vérifie les permissions, jamais
  par une URL publique.
- Vérification : téléverser puis télécharger un document depuis `/app/documents` ; l'objet doit
  apparaître dans *Storage → documents* et rester inaccessible sans session valide.

## 6. Authentification et e-mails

- Excellence 360 CRM gère sa propre authentification (scrypt + sessions en base) : **n'activez pas** Supabase
  Auth, il n'est pas utilisé.
- Pour la vérification d'adresse en production, configurez un transport réel (`MAIL_TRANSPORT=resend`
  + `RESEND_API_KEY`), puis `AUTH_REQUIRE_EMAIL_VERIFICATION=true`.
- Double authentification : définissez `MFA_ENCRYPTION_KEY` (`openssl rand -base64 32`) et conservez
  la clé hors du dépôt ; sans elle, l'activation de la 2FA est refusée.

## 7. Éviter la mise en pause du projet gratuit

Deux mécanismes gratuits :

1. **pg_cron** (Extensions → activer `pg_cron`) puis, une fois :

   ```sql
   select cron.schedule('excellence360-keepalive', '0 */6 * * *', $$ select 1 $$);
   ```

   Cette tâche entretient l'activité de la base ; elle n'écrit aucune donnée.
2. **Supervision HTTP** : un moniteur gratuit (UptimeRobot, Better Stack…) appelant
   `https://votre-domaine/api/health` toutes les 10 minutes. La sonde interroge la base : elle
   détecte une panne **et** maintient le projet éveillé.

Si le projet est malgré tout suspendu : tableau de bord Supabase → **Restore project** (quelques
minutes), puis vérifier `/api/health`.

## 8. Sauvegardes (le gratuit n'inclut pas de PITR)

```bash
# quotidien, hors du serveur applicatif
pg_dump "$DATABASE_URL" --no-owner --no-privileges -Fc -f /var/backups/excellence360-$(date +%F).dump
```

- Copiez l'archive **hors de Supabase** (stockage objet, autre machine) et chiffrez-la.
- Testez une restauration par trimestre sur un projet Supabase de test (gratuit) :
  `pg_restore` puis `npm run db:status` → 23/23 migrations.
- Les documents du bucket ne sont pas dans le dump : sauvegardez-les via l'API Storage
  (`SUPABASE_SERVICE_ROLE_KEY`) ou `supabase storage cp`.

## 9. Checklist de mise en service

- [ ] `DATABASE_MODE=postgres`, `DATABASE_URL` = pooler (port 6543), `DATABASE_POOL_MAX` ≤ 5
- [ ] `npm run db:migrate` → `npm run db:status` : **23/23**, « Bascule de rôle applicatif : OK »
- [ ] `npm run admin:create` (compte réel propriétaire), **aucun** `db:seed` en production
- [ ] `MFA_ENCRYPTION_KEY`, `APP_URL`, transport e-mail réel configurés
- [ ] Bucket `documents` privé + `STORAGE_DRIVER=supabase` + test d'upload/téléchargement réel
- [ ] `npm run build` puis `npm run smoke -- --url https://votre-domaine` → 20/20
- [ ] `/api/health` branché sur une supervision externe (gratuite) + keep-alive
- [ ] Sauvegarde `pg_dump` planifiée, copie hors Supabase, restauration testée
- [ ] RLS vérifiée : `npm run db:status` → 49/49 tables forcées ; tests `npm test` verts
