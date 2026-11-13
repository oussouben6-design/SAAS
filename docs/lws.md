# Héberger Excellence 360 CRM sur un sous-domaine cPanel (LWS)

Ce guide couvre **un sous-domaine cPanel LWS** (`360crm.excellence-services-sarl.com`) : mise en
ligne, mise à jour et **référencement**. Chaque étape indique comment vérifier qu'elle a réussi ;
aucune promesse invérifiable.

> **Dernière vérification des prérequis :** novembre 2026, documentation LWS (article « How to deploy
> a Node.js application on cPanel »). Les offres concernées sont **cPanel L, cPanel XL, cPanel 2XL,
> cPanel 3XL et CloudCP** — celles qui proposent « Setup Node.js App ». Un « hébergement mutualisé »
> LWS Panel (Perso/Pro/Business) **n'exécute pas** Node.js : il faut demander le plan cPanel.

---

## 1. Ce que cPanel change par rapport à un serveur dédié

| Point | Serveur dédié / VPS | **cPanel LWS (notre cas)** |
| --- | --- | --- |
| Accès root | oui | **non** |
| Démarrage de l'application | `pm2 start`, `next start`, systemd | **Phusion Passenger**, piloté par Apache |
| Fichier de démarrage | libre | **`passenger.cjs`** (champ « Application startup file ») |
| Port d'écoute | `next start -p 3000` | Passenger remplace `http.Server.listen()` : **aucun port TCP** |
| Reverse proxy | à configurer | **interdit** (Apache + Passenger s'en chargent) |
| HTTPS | certbot / Let's Encrypt | **Let's Encrypt AutoSSL** depuis cPanel (gratuit) |
| Build | à lancer avant le redémarrage | **identique** : cPanel ne construit rien tout seul |
| Base et fichiers | au choix | **Supabase** obligatoire (pooler + bucket privé) |

C'est la raison pour laquelle `next start`, `pm2` et un VirtualHost Apache ne peuvent pas être
utilisés ici : les anciens fichiers de type « VPS » ont été retirés du dépôt. La place est au kit
`deploy/cpanel/`.

---

## 2. Ce que contient le dépôt

| Fichier | Rôle |
| --- | --- |
| `passenger.cjs` | **Fichier de démarrage Passenger** (racine du projet) : charge `.env.production`, prépare Next.js, se présente à Passenger via `listen('passenger')` |
| `deploy/cpanel/verify-subdomain.sh` | Vérifie le sous-domaine, son DocumentRoot et la version de Node **avant** d'installer (ne modifie rien) |
| `deploy/cpanel/install-on-cpanel.sh` | Installation complète : code → dépendances → `env:check` → build → relance Passenger → santé |
| `deploy/cpanel/deploy.sh` | Mise à jour de production (même chaîne, sans la configuration initiale) |
| `deploy/cpanel/public_html.htaccess` | **Active Passenger** dans le DocumentRoot et transmet les en-têtes HTTPS |
| `deploy/cpanel/healthcheck.cjs` | Démarre `passenger.cjs` sur `127.0.0.1` et interroge `/api/health` (distingue code cassé et Apache mal réglé) |
| `deploy/cpanel/check-remote.sh` | Contrôles HTTPS publics : santé, `robots.txt`, `sitemap.xml`, canonique, source non téléchargeable |
| `deploy/cpanel/env.production.example` | Toutes les variables de production, commentées |
| `.github/workflows/deploy-cpanel.yml` | Déploiement automatique après CI verte sur `main`, puis contrôle HTTPS |

Architecture :

```
Internet ──HTTPS──▶ Apache (cPanel, AutoSSL)
                        │  Phusion Passenger
                        ▼
                    passenger.cjs ──▶ Next.js 15 (même processus)
                                          ├─▶ Supabase PostgreSQL (pooler 6543)
                                          ├─▶ Supabase Storage (bucket `documents`)
                                          └─▶ Resend (e-mails, code de connexion)
```

---

## 3. Préparer Supabase (une fois)

Le schéma est **déjà appliqué en production** (`26/26` migrations). Si vous partez d'un projet neuf :

```bash
DATABASE_MODE=postgres DATABASE_URL='postgresql://…pooler…:6543/postgres' npm run db:migrate
npm run db:status   # 26/26
```

Récupérez, depuis la console Supabase :

| Variable | Où | Remarque |
| --- | --- | --- |
| `DATABASE_URL` | Project Settings → Database → **Session pooler** (port **6543**) | la connexion directe `db.<réf>.supabase.co` est en IPv6 : **injoignable** depuis cPanel |
| `SUPABASE_URL` | Project Settings → API → Project URL | |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → `service_role` | **jamais** de préfixe `NEXT_PUBLIC_` |
| bucket `documents` | Storage → New bucket → **privé** | limite 10 Mo suffisante |

Compte réel : `npm run admin:create -- --email … --name … --org …` (jamais `db:seed` en production).

---

## 4. Créer le sous-domaine dans cPanel

1. **Domaines** → *Créer un domaine* → type **Sous-domaine**.
2. Sous-domaine : `360crm`, domaine racine : `excellence-services-sarl.com`.
3. DocumentRoot : **un dossier dédié**, par exemple `public_html/360crm`
   (décochez « Partagez ce DocumentRoot » si cPanel le propose).
4. **Force HTTPS Redirect** : activé.

> ⚠️ **Le code ne doit JAMAIS être dans le DocumentRoot.** Dans le DocumentRoot, il n'y a qu'un
> fichier : le `.htaccess` du § 6. L'application vit dans `~/apps/excellence360`. Si les deux
> coïncident, `package.json`, `.env.production` et le code source deviennent téléchargeables.

Vérifiez avant tout le reste (aucune modification) :

```bash
mkdir -p ~/apps/excellence360
cd ~/apps/excellence360 && git clone https://github.com/oussouben6-design/SAAS.git .
bash deploy/cpanel/verify-subdomain.sh 360crm.excellence-services-sarl.com
```

Le script affiche le DocumentRoot réel, le dossier d'application et la version de Node, en terminant
par un `✓` ou un `✗`.

Dépôt privé ? créez une **clé de déploiement** (GitHub → Settings → Deploy keys, lecture seule) :

```bash
ssh-keygen -t ed25519 -C "cpanel-360crm" -f ~/.ssh/id_deploy_cpanel -N ""
cat ~/.ssh/id_deploy_cpanel.pub    # à coller dans GitHub
```

---

## 5. Créer l'application Node.js dans cPanel

**cPanel → Setup Node.js App → Create Application** :

| Champ | Valeur |
| --- | --- |
| Node.js version | **22** (minimum 20.9 — `package.json`) |
| Application mode | Production |
| Application root | `apps/excellence360` |
| Application URL | `360crm.excellence-services-sarl.com` (racine `/`) |
| **Application startup file** | **`passenger.cjs`** |

Puis **Create**. cPanel génère un environnement virtuel propre à l'application ; le terminal affiche
la commande `source /home/<compte>/nodevenv/apps/excellence360/22/bin/activate` — c'est elle qui
donne le bon `node`/`npm`. L'installateur la détecte au besoin et sinon vous indique quoi faire.

---

## 6. Activer Passenger dans le DocumentRoot

Copiez `deploy/cpanel/public_html.htaccess` à la racine du DocumentRoot (`public_html/360crm`),
puis **remplacez `USER`** par votre identifiant cPanel — c'est le seul chemin à adapter :

```apache
PassengerAppRoot /home/USER/apps/excellence360
PassengerLogFile /home/USER/logs/excellence360-passenger.log
```

```bash
cp ~/apps/excellence360/deploy/cpanel/public_html.htaccess ~/public_html/360crm/.htaccess
sed -i "s#/home/USER/#$HOME/#g" ~/public_html/360crm/.htaccess
```

Sans ce fichier, Apache sert un dossier vide : **403** ou « Index of / ». C'est le symptôme n°1 d'un
site « installé mais invisible ».

> `.htaccess` n'est lu que si Apache autorise `AllowOverride` sur ce dossier — c'est le réglage par
> défaut des comptes cPanel LWS. Si les directives `Passenger…` sont ignorées (erreur 500 avec
> « Invalid command 'PassengerEnabled' »), utilisez l'interface graphique
> **Setup Node.js App** (qui écrit cette configuration elle-même) plutôt que le fichier.

---

## 7. Variables et premier déploiement

```bash
cd ~/apps/excellence360
cp deploy/cpanel/env.production.example .env.production
nano .env.production        # APP_URL, DATABASE_URL, SUPABASE_*, RESEND_API_KEY, clés
chmod 600 .env.production
bash deploy/cpanel/install-on-cpanel.sh
```

Ce que fait l'installateur, dans cet ordre, en s'arrêtant au premier échec :

1. vérifie Node ≥ 20.9 ;
2. met le code à jour (`git fetch` + `reset --hard`) ;
3. vérifie `.env.production` (présence et contenu minimal, droits `600`) ;
4. lance `env:check` — qui **liste précisément** la variable manquante ;
5. `npm ci` (versions exactes du `package-lock.json`) ;
6. `npm run build` — **obligatoire** : Passenger ne compile rien ;
7. `touch tmp/restart.txt` — Passenger relance `passenger.cjs` ;
8. démarre `passenger.cjs` sur `127.0.0.1` et vérifie `/api/health` ;
9. rappelle l'URL publique et la commande de contrôle.

Contrôles :

```bash
curl -I https://360crm.excellence-services-sarl.com          # 200 + HSTS
curl -s https://360crm.excellence-services-sarl.com/api/health   # "status":"ok", 26/26
tail -n 50 ~/logs/excellence360-passenger.log                # journaux de l'application
```

Depuis un poste de développement :

```bash
npm run smoke -- --url https://360crm.excellence-services-sarl.com --token <jeton>
# 23 contrôles : pages publiques, /api/health, robots.txt, sitemap.xml, canonique/Open Graph, 17 pages métier
```

---

## 8. Mises à jour

**Manuel** (le plus simple, et suffisant) :

```bash
bash ~/apps/excellence360/deploy/cpanel/deploy.sh
```

**Automatique** : `.github/workflows/deploy-cpanel.yml` se déclenche après une CI verte sur `main`.
Secrets à créer (Settings → Secrets and variables → Actions) :

| Secret | Valeur |
| --- | --- |
| `CPANEL_SSH_HOST` | IP du serveur cPanel (pas le sous-domaine) |
| `CPANEL_SSH_USER` | identifiant cPanel |
| `CPANEL_SSH_PORT` | port SSH (souvent `22`) |
| `CPANEL_SSH_KEY` | clé privée créée dans cPanel → **Clés SSH** (autorisée pour le compte) |
| `CPANEL_APP_DIR` | `/home/<compte>/apps/excellence360` |
| `CPANEL_SITE_URL` | `https://360crm.excellence-services-sarl.com` |

Le workflow rejoue `deploy.sh`, puis vérifie en HTTPS la santé, l'absence de page Apache, les balises
et l'inaccessibilité du code source.

> Pas de SSH ? cPanel → **Terminal** (navigateur) permet d'exécuter exactement les mêmes commandes.

`npm ci` réinstalle exactement le `package-lock.json` ; la base et les documents ne sont jamais
touchés par un déploiement.

---

## 9. Référencement

### 9.1 Déjà en place dans le code

| Élément | Fichier | Effet |
| --- | --- | --- |
| URL canonique absolue (`metadataBase`) | `src/lib/seo.ts` | plus jamais de `localhost` dans les balises |
| Balise `canonical` | `src/app/layout.tsx` | évite le contenu dupliqué `www` / sans `www` |
| `robots.txt` généré | `src/app/robots.ts` | sitemap déclaré ; `/app`, `/api`, connexion, invitations exclus |
| `sitemap.xml` généré | `src/app/sitemap.ts` | seules les pages publiques, URL absolues |
| `noindex` sur l'espace client | `src/app/app/layout.tsx`, `(auth)/layout.tsx`, onboarding, invitations | aucune fuite d'écran privé |
| Open Graph + Twitter Card | `src/app/layout.tsx` | aperçu correct sur WhatsApp, LinkedIn, Facebook |
| Données structurées JSON-LD | `src/lib/seo.ts` | `Organization` + `SoftwareApplication` |
| Titres, description, mots-clés, `lang="fr"` | `src/app/layout.tsx` | base d'indexation en français |
| Vérification Google | variable `GOOGLE_SITE_VERIFICATION` | balise ajoutée seulement si renseignée |

### 9.2 Google Search Console (10 minutes)

1. [search.google.com/search-console](https://search.google.com/search-console) → **Ajouter une
   propriété** → **Préfixe d'URL** → `https://360crm.excellence-services-sarl.com`.
2. Méthode **balise HTML** : copiez la valeur de `content="…"` dans `.env.production`
   (`GOOGLE_SITE_VERIFICATION=…`), puis `touch tmp/restart.txt` **et** `npm run build`
   (la balise est rendue au build) — l'installateur le fait pour vous.
   *Alternative sans redéploiement : propriété « Domaine » + un enregistrement `TXT` dans la zone DNS
   (cPanel → Zone Editor).*
3. **Sitemaps** → soumettre `https://360crm.excellence-services-sarl.com/sitemap.xml`.
4. **Inspection de l'URL** → `https://360crm.excellence-services-sarl.com/` → **Demander une
   indexation**.
5. Répétez sur **Bing Webmaster Tools** (import depuis Search Console).

### 9.3 Ce qui fait réellement monter la page

Un CRM authentifié n'a qu'une page publique : le référencement se gagne **hors de l'application**.

1. **Créer 3 à 5 pages publiques utiles** (ajoutez-les dans `PUBLIC_PAGES`, `src/lib/seo.ts`, puis
   créez les routes) : *« Logiciel de gestion pour PME au Niger »*, *« Logiciel de facturation
   conforme OHADA »*, *« Ce que fait vraiment un CRM pour une PME »*. 400 à 800 mots chacune, sans
   recopier l'accueil.
2. **Fiche Google Business Profile** pour Excellence Services (Niamey, catégorie *Fournisseur de
   logiciels*) avec le lien vers le sous-domaine : le levier local le plus rapide.
3. **Contenu de confiance** : mentions légales, politique de confidentialité, page contact avec
   adresse et téléphone.
4. **Performance** : vérifiez PageSpeed Insights ; objectif LCP < 2,5 s en 4G. Le cache immuable
   de `/_next/static/*` est posé par le `.htaccess`.
5. **Netlinking sobre** : annuaires professionnels nigériens, chambre de commerce, partenaires,
   signature d'e-mail, LinkedIn. Aucun achat de liens.

### 9.4 Vérifier soi-même

```bash
curl -s https://360crm.excellence-services-sarl.com/robots.txt
curl -s https://360crm.excellence-services-sarl.com/sitemap.xml | head -20
curl -s https://360crm.excellence-services-sarl.com/ | grep -E 'canonical|og:|application/ld\+json'
```

Attendu : `Sitemap: https://…/sitemap.xml`, `Disallow: /app`, une canonique **en https sur votre
domaine**, `og:title`, `og:image`, et le bloc JSON-LD. `bash deploy/cpanel/check-remote.sh` fait ces
contrôles et échoue explicitement s'ils ne passent pas.

---

## 10. Exploitation courante

| Besoin | Où / commande |
| --- | --- |
| Redémarrer l'application | `touch ~/apps/excellence360/tmp/restart.txt` |
| Voir les journaux | `tail -n 100 ~/logs/excellence360-passenger.log` (ou cPanel → Erreurs) |
| Changer une variable | éditer `.env.production` → `touch tmp/restart.txt` (+ `npm run build` si `NEXT_PUBLIC_*`) |
| Forcer une version de Node | cPanel → Setup Node.js App → modifier |
| Purge des sessions | `.github/workflows/cron.yml` (`APP_URL`, `MAINTENANCE_SECRET`) ou `curl -X POST -H "x-maintenance-secret: …" https://…/api/maintenance` |
| Certificat HTTPS | cPanel → SSL/TLS Status → *Run AutoSSL* ; contrôle : `openssl s_client -connect …:443` |
| Sauvegarde | Supabase (base + Storage) ; le serveur cPanel ne détient aucune donnée métier |
| Espace disque | cPanel → Fichiers → Utilisation du disque (`node_modules` et `.next` sont les plus gros) |

---

## 11. Dépannage

| Symptôme | Cause probable | Remède |
| --- | --- | --- |
| `403 Forbidden` ou « Index of / » | Passenger non activé dans le DocumentRoot | placer le `.htaccess` du § 6, `PassengerAppRoot` adapté au compte |
| `503 Service Unavailable` | `passenger.cjs` plante au démarrage | lire `~/logs/excellence360-passenger.log` ; causes : `.env.production` absent, build manquant, Node trop ancien |
| `500` avec « Invalid command 'PassengerEnabled' » | `AllowOverride`/module Passenger absent | configurer via **Setup Node.js App** au lieu du `.htaccess` |
| Page de connexion impossible, code jamais reçu | `MAIL_TRANSPORT=resend` sans clé valide, ou `MAIL_FROM` non vérifié | corriger Resend, ou `AUTH_LOGIN_OTP=false` **temporairement** |
| Build refusé par `env:check` | variable absente ou URL en `localhost` | le message liste la variable **et** où la trouver |
| Erreur 500 « base injoignable » | `DATABASE_URL` sur la connexion directe (IPv6) | utiliser le **pooler**, port 6543 |
| `npm ci` tué (« process stopped ») | mémoire du compte cPanel | `NODE_OPTIONS=--max-old-space-size=2048 npm ci` |
| Le site affiche l'ancienne version | build non relancé, ou navigateur en cache | `deploy.sh`, puis navigation privée |
| `www` ne répond pas | le sous-domaine n'a pas d'alias `www` | créer un alias dans cPanel → Domaines (facultatif) |
| Canonique en `localhost` | `NEXT_PUBLIC_SITE_URL`/`APP_URL` oubliée | renseigner puis reconstruire |
| `404` sur `/robots.txt` | build antérieur au SEO, ou fichier servi par Apache | reconstruire ; vérifier que le `.htaccess` ne bloque pas ce chemin |

---

## 12. Checklist de mise en ligne

- [ ] Plan **cPanel** confirmé (pas un mutualisé LWS Panel) ; Node 22 disponible dans *Setup Node.js App*
- [ ] Sous-domaine créé, DocumentRoot dédié, Force HTTPS activé
- [ ] `verify-subdomain.sh` en `✓`
- [ ] Application Node.js créée (startup file **`passenger.cjs`**, mode Production)
- [ ] `.htaccess` en place dans le DocumentRoot, `PassengerAppRoot` adapté au compte
- [ ] Code dans `~/apps/excellence360`, **hors** du DocumentRoot
- [ ] `.env.production` renseigné (`chmod 600`), base sur le **pooler** port 6543
- [ ] `install-on-cpanel.sh` vert : build OK, `/api/health` sain
- [ ] `curl -I https://…` → 200 ; le site affiche l'application, pas une page Apache
- [ ] `check-remote.sh` vert (dont code source non téléchargeable)
- [ ] Compte réel créé (`admin:create` ou `/inscription`) — **jamais** `db:seed` en production
- [ ] Resend opérationnel : e-mail de code à 6 chiffres reçu et utilisé
- [ ] Search Console : propriété validée, sitemap soumis, indexation demandée
- [ ] `MFA_ENCRYPTION_KEY` et `MAINTENANCE_SECRET` conservés hors ligne (coffre)
- [ ] `deploy.sh` testé une fois après le premier déploiement
