# Héberger Excellence 360 CRM chez LWS — `360crm.excellence-services-sarl.com`

Ce guide couvre les deux choses demandées : **mettre le domaine en ligne chez LWS** et **le faire
référencer**. Il ne promet rien d'invérifiable : chaque étape indique comment contrôler qu'elle a
réussi.

Fichiers fournis dans le dépôt :

| Fichier | Rôle |
| --- | --- |
| `deploy/lws/install-server.sh` | Prépare un serveur LWS neuf (Node 22, PM2, Apache, certbot, pare-feu, fail2ban) |
| `deploy/lws/env.production.example` | Toutes les variables de production, commentées |
| `deploy/lws/ecosystem.config.cjs` | Processus Next.js géré par PM2, écoute sur `127.0.0.1:3000` |
| `deploy/lws/deploy.sh` | Déploiement (git, `npm ci`, contrôle de configuration, build, rechargement, santé) |
| `deploy/lws/apache/360crm…conf` | VirtualHost Apache + HTTPS + proxy + cache |
| `deploy/lws/apache/public_html.htaccess` | Variante `.htaccess` (offres Cloud avec proxy autorisé) |
| `.github/workflows/deploy-lws.yml` | Déploiement automatique après une CI verte sur `main` |

---

## 1. Ce que LWS peut réellement héberger (à lire avant tout)

Excellence 360 CRM est une application **Next.js avec serveur** : connexion, Server Actions,
génération de pages et API ont besoin d'un processus Node.js vivant. Ce n'est pas un site statique.

| Offre LWS | Convient ? | Pourquoi |
| --- | --- | --- |
| **Hébergement mutualisé** (Perso, Pro, Business) | ❌ Non | Apache + PHP uniquement, pas de Node.js. Un export statique ferait perdre connexion, base et téléversements. |
| **Cloud KVM / VPS LWS** (Debian/Ubuntu) | ✅ Oui — **solution retenue** | Node 22, Apache en reverse proxy, HTTPS Let's Encrypt, base chez Supabase (déjà en place) |
| Domaine + DNS LWS (quel que soit l'hébergement) | ✅ Oui | C'est ici que se règlent `360crm.…` et le référencement |

> **Si vous ne voulez pas administrer un serveur** : gardez le domaine chez LWS et pointez-le vers
> Netlify ou Vercel (`docs/netlify.md`, `docs/vercel.md`) par un enregistrement `CNAME`. Le
> référencement décrit au § 7 est **identique** ; seule la partie serveur (§ 2 à § 6) disparaît.
> Le reste de ce guide suppose un **Cloud KVM LWS**.

Architecture cible :

```
Internet ──HTTPS──▶ Apache (LWS, ports 80/443, certificat Let's Encrypt)
                        │  proxy 127.0.0.1:3000
                        ▼
                    Next.js 15 (PM2, Node 22)  ──▶  Supabase PostgreSQL (pooler 6543)
                                               └─▶  Supabase Storage (bucket `documents`)
                                               └─▶  Resend (e-mails, code de connexion)
```

---

## 2. Domaine et DNS chez LWS

1. Panneau LWS → **Noms de domaine** → `excellence-services-sarl.com` → **Gérer** →
   **Sous-domaines** : créer `360crm`.
2. **Zone DNS** → vérifier l'enregistrement du sous-domaine :

   | Type | Nom | Valeur | TTL |
   | --- | --- | --- | --- |
   | `A` | `360crm` | *IP publique du Cloud KVM* | 3600 |
   | `AAAA` | `360crm` | *(à supprimer si IPv6 non configurée sur le serveur)* | — |
   | `CNAME` | `www.360crm` | `360crm.excellence-services-sarl.com.` | 3600 |

   L'IP du serveur se lit sur la console LWS (ou `curl -4 ifconfig.me` depuis le serveur).
3. Propagation : `dig +short 360crm.excellence-services-sarl.com` doit renvoyer cette IP
   (compter de quelques minutes à quelques heures).

> ⚠️ N'utilisez **pas** les serveurs de noms LWS si votre zone est gérée ailleurs : les
> enregistrements doivent être posés **là où sont les serveurs de noms** du domaine.

---

## 3. Préparer le serveur (une fois)

```bash
scp deploy/lws/install-server.sh root@<IP_DU_SERVEUR>:/root/
ssh root@<IP> 'bash /root/install-server.sh'
```

Le script installe et configure : Node.js 22 (NodeSource), PM2, Apache 2.4 + modules proxy/headers/
rewrite/ssl, certbot, `ufw` (SSH + 80 + 443 seulement), `fail2ban`, la rotation des journaux et
crée l'utilisateur sans privilèges `excellence360`. Il est **idempotent** : le relancer ne casse rien.

Récupérer ensuite le code sur le serveur :

```bash
ssh root@<IP>
sudo -u excellence360 git clone https://github.com/oussouben6-design/SAAS.git /var/www/excellence360
```

*Dépôt privé ?* Créez une **clé de déploiement** (GitHub → Settings → Deploy keys, lecture seule) :

```bash
sudo -u excellence360 ssh-keygen -t ed25519 -C "lws-360crm" -f /home/excellence360/.ssh/id_ed25519 -N ""
sudo -u excellence360 cat /home/excellence360/.ssh/id_ed25519.pub   # à coller dans GitHub
```

---

## 4. Variables d'environnement de production

```bash
sudo -u excellence360 cp /var/www/excellence360/deploy/lws/env.production.example \
                          /var/www/excellence360/.env.production
sudo -u excellence360 nano /var/www/excellence360/.env.production
chmod 600 /var/www/excellence360/.env.production
```

Les valeurs indispensables :

| Variable | Valeur |
| --- | --- |
| `APP_URL`, `NEXT_PUBLIC_SITE_URL` | `https://360crm.excellence-services-sarl.com` |
| `DATABASE_MODE` | `postgres` |
| `DATABASE_URL` | pooler Supabase (**port 6543**) — la connexion directe est IPv6 |
| `DATABASE_POOL_MAX` | `5` (serveur dédié : pas de limite serverless) |
| `AUTO_MIGRATE` | `false` (le schéma est déjà appliqué : 26 migrations) |
| `STORAGE_DRIVER` | `supabase` + `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, bucket `documents` |
| `MAIL_TRANSPORT` | `resend` + `RESEND_API_KEY` + `MAIL_FROM` vérifié |
| `AUTH_LOGIN_OTP` | `true` — **sans Resend, aucune connexion n'est possible** (`false` en secours) |
| `MFA_ENCRYPTION_KEY` | `openssl rand -base64 32` (à conserver : sinon les 2FA deviennent illisibles) |
| `MAINTENANCE_SECRET` | `openssl rand -hex 32` |
| `AUTH_ALLOW_REGISTRATION` | `false` (comptes sur invitation) |
| `GOOGLE_SITE_VERIFICATION` | jeton Search Console (§ 7.2) — facultatif |

Générer les clés :

```bash
openssl rand -base64 32   # MFA_ENCRYPTION_KEY
openssl rand -hex 32      # MAINTENANCE_SECRET
```

---

## 5. Premier déploiement et HTTPS

```bash
sudo -u excellence360 bash /var/www/excellence360/deploy/lws/deploy.sh
```

Le script **s'arrête au premier échec** : code récupéré, `npm ci`, `env:check` (liste exactement la
variable manquante), `next build`, `pm2 reload`, puis `curl /api/health` jusqu'à obtenir
`"status":"ok"`. Il affiche le commit déployé.

Puis Apache et le certificat :

```bash
cp /var/www/excellence360/deploy/lws/apache/360crm.excellence-services-sarl.com.conf \
   /etc/apache2/sites-available/
a2ensite 360crm.excellence-services-sarl.com
apache2ctl configtest && systemctl reload apache2

certbot --apache -d 360crm.excellence-services-sarl.com -d www.360crm.excellence-services-sarl.com \
        --redirect -m contact@excellence-services-sarl.com --agree-tos
```

Contrôles :

```bash
curl -I https://360crm.excellence-services-sarl.com          # 200, Strict-Transport-Security
curl -s https://360crm.excellence-services-sarl.com/api/health   # "status":"ok", 26/26 migrations
sudo -u excellence360 pm2 status
sudo -u excellence360 pm2 logs excellence360-crm --lines 50
```

Puis, depuis un poste de développement (le contrôle complet exige une session) :

```bash
npm run smoke -- --url https://360crm.excellence-services-sarl.com --token <jeton>
# 23 contrôles : 2 pages publiques, /api/health, robots.txt, sitemap.xml, page d'accueil
# (canonique + Open Graph), 17 pages métier
```

> `smoke` échoue volontairement si `robots.txt` n'annonce pas le sitemap, si `/app` n'est pas exclu,
> si la balise canonique pointe sur `localhost`, ou si l'accueil porte un `noindex`.

---

## 6. Mises à jour

**Automatique** (recommandé) : après chaque fusion sur `main`, la CI doit être verte, puis
`.github/workflows/deploy-lws.yml` se connecte en SSH et rejoue `deploy.sh`, avant de vérifier en
HTTPS la santé, `robots.txt`, `sitemap.xml` et les balises de l'accueil.

Secrets à créer (Settings → Secrets and variables → Actions) :

| Secret | Valeur |
| --- | --- |
| `LWS_SSH_HOST` | IP du serveur |
| `LWS_SSH_USER` | `excellence360` |
| `LWS_SSH_KEY` | clé **privée** ed25519 dédiée au déploiement (sans phrase secrète) |
| `LWS_APP_DIR` | `/var/www/excellence360` (facultatif) |
| `LWS_SITE_URL` | `https://360crm.excellence-services-sarl.com` (facultatif) |

La clé publique correspondante va dans `/home/excellence360/.ssh/authorized_keys`.

**Manuel** :

```bash
sudo -u excellence360 bash /var/www/excellence360/deploy/lws/deploy.sh
```

Le déploiement ne touche **ni** la base **ni** les documents ; `npm ci` réinstalle exactement le
`package-lock.json`.

---

## 7. Référencement — ce que le dépôt fait, ce qu'il vous reste à faire

### 7.1 Déjà en place dans le code

| Élément | Fichier | Effet |
| --- | --- | --- |
| URL canonique absolue (`metadataBase`) | `src/lib/seo.ts` | Plus jamais de `localhost` dans les balises |
| Balise `canonical` | `src/app/layout.tsx` | Évite le contenu dupliqué `www` / sans `www` |
| `robots.txt` généré | `src/app/robots.ts` | Sitemap déclaré ; `/app`, `/api`, connexion, invitations exclus |
| `sitemap.xml` généré | `src/app/sitemap.ts` | Seules les pages publiques, URL absolues |
| `noindex` sur l'espace client | `src/app/app/layout.tsx`, `(auth)/layout.tsx`, onboarding, invitations | Aucune fuite d'écran privé dans les résultats |
| Open Graph + Twitter Card | `src/app/layout.tsx` | Aperçu correct sur WhatsApp, LinkedIn, Facebook |
| Données structurées JSON-LD | `src/lib/seo.ts` | `Organization` + `SoftwareApplication` (résultats enrichis) |
| Titres, description, mots-clés, `lang="fr"` | `src/app/layout.tsx` | Base d'indexation en français |
| Vérification Google (optionnelle) | variable `GOOGLE_SITE_VERIFICATION` | Balise ajoutée seulement si renseignée |

### 7.2 Google Search Console (10 minutes)

1. [search.google.com/search-console](https://search.google.com/search-console) → **Ajouter une
   propriété** → **Préfixe d'URL** → `https://360crm.excellence-services-sarl.com`.
2. Méthode **balise HTML** : copiez la valeur de `content="…"`, posez-la dans `.env.production`
   (`GOOGLE_SITE_VERIFICATION=…`), puis `pm2 reload excellence360-crm --update-env`. Validez.
   *(Alternative sans redéploiement : propriété « Domaine » + un enregistrement `TXT` chez LWS.)*
3. **Sitemaps** → soumettre `https://360crm.excellence-services-sarl.com/sitemap.xml`.
4. **Inspection de l'URL** → `https://360crm.excellence-services-sarl.com/` → **Demander une
   indexation**. Compter de quelques heures à quelques jours.
5. Répétez la soumission du sitemap sur **Bing Webmaster Tools** (import depuis Search Console).

### 7.3 Ce qui fait réellement monter la page

Un CRM authentifié n'a qu'une page publique : le référencement se gagne donc **hors de
l'application**, avec des pages qui répondent à une recherche réelle.

1. **Créer 3 à 5 pages publiques utiles** (dans `PUBLIC_PAGES`, `src/lib/seo.ts`, puis en créant les
   routes correspondantes) : *« Logiciel de gestion pour PME au Niger »*, *« Logiciel de facturation
   conforme OHADA »*, *« Gestion de la paie : ce que fait vraiment un CRM »*. Chacune avec un texte
   propre de 400 à 800 mots — pas de duplication de l'accueil.
2. **Fiche Google Business Profile** pour Excellence Services (Niamey, catégorie *Fournisseur de
   logiciels*), avec le lien vers le domaine : c'est le levier local le plus rapide au Niger.
3. **Contenu de confiance** : mentions légales, politique de confidentialité, page contact avec
   numéro et adresse. Un site sans ces pages est pénalisé en qualité perçue — et les visiteurs ne
   s'y inscrivent pas.
4. **Performance** : `next build` servi par Apache avec cache immuable sur `/_next/static/*` (déjà
   configuré). Vérifiez sur PageSpeed Insights ; l'objectif utile est un LCP < 2,5 s en 4G.
5. **Netlinking sobre** : annuaires professionnels nigériens, chambre de commerce, partenaires,
   signature d'e-mail, LinkedIn. Évitez l'achat de liens.
6. **Ne pas indexer l'application** : un `/app` indexé diffuse des écrans de connexion dans les
   résultats et dilue les pages utiles (déjà exclu par le code).

### 7.4 Vérifier le référencement soi-même

```bash
curl -s https://360crm.excellence-services-sarl.com/robots.txt
curl -s https://360crm.excellence-services-sarl.com/sitemap.xml | head -20
curl -s https://360crm.excellence-services-sarl.com/ | grep -E 'canonical|og:|application/ld\+json'
```

Attendu : `Sitemap: https://…/sitemap.xml`, `Disallow: /app`, une canonique **en https sur votre
domaine**, `og:title`, `og:image`, et le bloc JSON-LD.

---

## 8. Exploitation courante

| Besoin | Commande |
| --- | --- |
| État du processus | `sudo -u excellence360 pm2 status` |
| Journaux | `sudo -u excellence360 pm2 logs excellence360-crm --lines 100` |
| Redémarrer | `sudo -u excellence360 pm2 restart excellence360-crm --update-env` |
| Reprise après reboot | `pm2 startup` (déjà posé) + `pm2 save` (fait au premier déploiement) |
| Purge des sessions | `.github/workflows/cron.yml` (secrets `APP_URL`, `MAINTENANCE_SECRET`) ou `curl -X POST -H "x-maintenance-secret: …" https://…/api/maintenance` |
| Certificat | renouvellement automatique par certbot ; contrôle : `certbot renew --dry-run` |
| Mises à jour système | `apt update && apt upgrade` mensuel, puis `systemctl reload apache2` |
| Sauvegarde des documents | Supabase → Storage (les fichiers vivent dans le bucket, pas sur le serveur) |

Les **journaux applicatifs** sont dans `/var/log/excellence360/` (rotation quotidienne, 14 jours).

---

## 9. Dépannage

| Symptôme | Cause probable | Remède |
| --- | --- | --- |
| `502 Bad Gateway` | Processus Next.js arrêté | `pm2 status`, `pm2 logs`, relancer `deploy.sh` |
| Page de connexion impossible, code jamais reçu | `MAIL_TRANSPORT=resend` sans clé valide ou `MAIL_FROM` non vérifié | corriger Resend, ou `AUTH_LOGIN_OTP=false` **temporairement** |
| `env:check` refuse le build | variable absente ou URL en `localhost` | le message liste la variable **et** où la renseigner |
| Erreur 500 « base injoignable » | `DATABASE_URL` sur la connexion directe (IPv6) | utiliser le **pooler**, port 6543 |
| Le site affiche l'ancienne version | processus non rechargé / cache navigateur | `deploy.sh` (reload + santé), puis navigation privée |
| Le site répond mais `www` ne marche pas | `ServerAlias` absent ou certificat sans `www` | bloc Apache fourni (inclut `www`) + certbot avec les deux `-d` |
| `robots.txt` renvoie du HTML | proxy absent pour ce chemin | vérifier `ProxyPass / …` (ne pas servir de fichiers locaux) |
| Search Console : « Explorée, non indexée » | page sans contenu propre ou trop récente | ajouter du contenu réel, demander l'indexation, attendre |
| Canonique en `localhost` | `NEXT_PUBLIC_SITE_URL`/`APP_URL` oubliée | renseigner, `pm2 reload … --update-env` |

---

## 10. Checklist de mise en ligne

- [ ] Sous-domaine `360crm` créé chez LWS + enregistrement `A` vers l'IP du serveur
- [ ] `install-server.sh` exécuté (Node 22, PM2, Apache, certbot, pare-feu)
- [ ] Code présent dans `/var/www/excellence360`
- [ ] `.env.production` renseigné (`chmod 600`), URL en **https**, base sur le **pooler**
- [ ] `deploy.sh` vert, `/api/health` → `"status":"ok"`, 26/26 migrations
- [ ] VirtualHost activé, `certbot` posé, `https://` et `www` répondent en 200
- [ ] `npm run smoke` vert (dont `robots.txt`, `sitemap.xml`, canonique, Open Graph)
- [ ] Compte réel créé (`npm run admin:create` ou `/inscription`) — **jamais** `db:seed` en production
- [ ] Resend opérationnel, un e-mail de code à 6 chiffres reçu et utilisé
- [ ] Search Console : propriété validée, sitemap soumis, indexation demandée
- [ ] Sauvegardes Supabase activées ; `MFA_ENCRYPTION_KEY` et `MAINTENANCE_SECRET` conservés hors ligne
- [ ] Secrets GitHub `LWS_SSH_*` posés, déploiement automatique testé une fois
