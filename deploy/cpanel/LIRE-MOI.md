# Kit d'hébergement cPanel LWS — Excellence 360 CRM

Ce dossier contient **tout ce qui est nécessaire pour héberger le CRM sur un sous-domaine cPanel
LWS** (ex. `360crm.excellence-services-sarl.com`), avec Phusion Passenger.

> **Ce kit remplace l'ancien kit « Cloud KVM / VPS ».** Sur cPanel il n'y a ni root, ni PM2, ni
> reverse proxy : `next start`, `pm2` et un VirtualHost Apache **ne peuvent pas** fonctionner.
> Node.js y est exécuté par **Phusion Passenger**, qui démarre `passenger.cjs`.

---

## Contenu du dossier

```
excellence360-cpanel/
├── LIRE-MOI.md                        ← ce fichier
├── passenger.cjs                      ← fichier de démarrage Passenger (à la RACINE du projet)
├── public_html.htaccess               ← à placer dans le DocumentRoot du sous-domaine
├── env.production.example             ← variables de production (à copier en .env.production)
├── verify-subdomain.sh                ← vérifie le sous-domaine et Node (ne modifie rien)
├── install-on-cpanel.sh               ← installation complète
├── deploy.sh                          ← mises à jour suivantes
├── healthcheck.cjs                    ← contrôle de santé local
├── check-remote.sh                    ← contrôles HTTPS publics
├── deploy-cpanel.yml                  ← workflow GitHub Actions (déploiement auto)
├── lws.md                             ← guide complet (le document de référence)
├── env-check.ts                       ← préflight de configuration (utilisé par les scripts)
└── eslint.config.mjs                  ← configuration ESLint du projet
```

**Le kit n'est pas autonome** : c'est une partie du projet Next.js. Ces fichiers doivent se trouver
dans le dépôt complet pour que `npm run build` fonctionne. La méthode recommandée est donc le clone
Git décrit ci-dessous ; ce dossier sert de raccourci et de référence imprimable.

---

## Les 6 étapes, sans détour

### 1. Vérifier que l'offre est une formule cPanel

cPanel → **Setup Node.js App** doit exister. Formules concernées : **cPanel L, XL, 2XL, 3XL,
CloudCP**. Un hébergement « LWS Panel » (Perso / Pro / Business) **n'exécute pas Node.js** : il faut
demander le changement d'offre.

### 2. Créer le sous-domaine

cPanel → **Domaines** → *Créer un domaine* → **Sous-domaine** :

| Champ | Valeur |
| --- | --- |
| Sous-domaine | `360crm` |
| Domaine racine | `excellence-services-sarl.com` |
| DocumentRoot | `public_html/360crm` (dossier **dédié**) |
| Force HTTPS Redirect | activé |

> ⚠️ Le code ne va **jamais** dans le DocumentRoot. Dans ce dossier, il n'y a qu'un fichier :
> `public_html.htaccess`. L'application vit dans `~/apps/excellence360`.

### 3. Récupérer le code, hors du DocumentRoot

```bash
mkdir -p ~/apps/excellence360 && cd ~/apps/excellence360
git clone https://github.com/oussouben6-design/SAAS.git .
bash deploy/cpanel/verify-subdomain.sh 360crm.excellence-services-sarl.com
```

Le dernier script affiche le DocumentRoot réel, le dossier d'application et la version de Node.
Il termine par `✓` (tout est prêt) ou `✗` (avec la correction à faire).

### 4. Créer l'application Node.js

cPanel → **Setup Node.js App** → *Create Application* :

| Champ | Valeur |
| --- | --- |
| Node.js version | **22** (minimum 20.9) |
| Application mode | Production |
| Application root | `apps/excellence360` |
| Application URL | `360crm.excellence-services-sarl.com` |
| **Application startup file** | **`passenger.cjs`** |

### 5. Activer Passenger dans le DocumentRoot

```bash
cp ~/apps/excellence360/deploy/cpanel/public_html.htaccess ~/public_html/360crm/.htaccess
sed -i "s#/home/USER/#$HOME/#g" ~/public_html/360crm/.htaccess
```

Sans ce fichier : **403** ou « Index of / » — le site est installé mais invisible.

### 6. Variables puis installation

```bash
cd ~/apps/excellence360
cp deploy/cpanel/env.production.example .env.production
nano .env.production      # APP_URL, DATABASE_URL (pooler 6543), SUPABASE_*, RESEND_API_KEY, clés
chmod 600 .env.production
bash deploy/cpanel/install-on-cpanel.sh
```

L'installateur enchaîne : contrôle de Node → code → variables → `env:check` → `npm ci` →
**build** → `tmp/restart.txt` (relance Passenger) → santé locale → URL publique.
Il s'arrête au premier échec en indiquant quoi corriger.

**Ouvrez ensuite `https://360crm.excellence-services-sarl.com` : vous devez voir l'application, pas
une page Apache.**

---

## Mises à jour

```bash
bash ~/apps/excellence360/deploy/cpanel/deploy.sh
```

Ou automatiquement, après une CI verte sur `main` : `.github/workflows/deploy-cpanel.yml`
(secrets `CPANEL_SSH_HOST`, `CPANEL_SSH_USER`, `CPANEL_SSH_PORT`, `CPANEL_SSH_KEY`,
`CPANEL_APP_DIR`, `CPANEL_SITE_URL`).

---

## Dépannage express

| Symptôme | Cause | Remède |
| --- | --- | --- |
| `403` / « Index of / » | Passenger inactif | étape 5 (`.htaccess` + `PassengerAppRoot`) |
| `503` | `passenger.cjs` plante | `tail -n 100 ~/logs/excellence360-passenger.log` |
| `500` « Invalid command 'PassengerEnabled' » | `.htaccess` non autorisé | configurer via **Setup Node.js App** |
| Ancienne version affichée | build non relancé / cache | `deploy.sh`, puis navigation privée |
| Code jamais reçu par e-mail | Resend absent ou `MAIL_FROM` non vérifié | clé Resend, ou `AUTH_LOGIN_OTP=false` en secours |

Le détail complet (référencement, Search Console, exploitation, checklist) est dans **`lws.md`**.

---

## Ce que l'hébergement utilise

| Besoin | Solution |
| --- | --- |
| Base PostgreSQL | Supabase — **pooler**, port **6543** (la connexion directe est en IPv6) |
| Documents | Supabase Storage, bucket privé `documents` |
| E-mails | Resend (obligatoire tant que le code de connexion OTP est actif) |
| HTTPS | Let's Encrypt AutoSSL (cPanel) |

Aucune donnée métier ne vit sur le serveur cPanel : une migration d'hébergement ne perd rien.
