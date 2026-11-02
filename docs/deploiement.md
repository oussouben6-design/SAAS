# Déploiement

> **Aucun déploiement n'a été réalisé à ce jour.** Ce document décrit une procédure reproductible ;
> ne déclarez « en production » qu'après avoir exécuté la liste de vérification finale.

## Option A — Hébergeur Node (Vercel, Render, Railway, VPS)

**Contraintes du code actuel** :

- Le serveur doit être **Node.js** (runtime Node, pas Edge) : `pg`, `node:crypto` (scrypt) et le
  stockage local sur disque sont utilisés.
- Si `DATABASE_MODE=postgres` → aucun état local ; l'application est sans état et peut être
  déployée sur plusieurs instances.
- Si `STORAGE_DRIVER=local` → **un seul disque persistant** partagé : incompatible avec un
  déploiement multi-instances ou un système de fichiers éphémère (Vercel). Dans ce cas, montez un
  volume persistant (Render Disks, VPS) ou attendez l'implémentation du stockage objet.
- PGlite (`DATABASE_MODE=pglite`) est réservé au développement / démonstration mono-processus.

### Étapes (exemple : VPS Linux + PostgreSQL managé)

```bash
# 1. Base : créer la base PostgreSQL et récupérer la chaîne de connexion
# 2. Sur le serveur
npm ci
npm run build
cp .env.example .env.production   # renseigner les variables (voir docs/configuration.md)
npm run db:migrate
NODE_ENV=production npm start     # écoute sur 0.0.0.0:3000
```

Placez un reverse proxy (Nginx / Caddy) devant l'application pour :

- terminer le TLS (HTTPS obligatoire : cookies `Secure` en production) ;
- transmettre `Host` et `X-Forwarded-*` ;
- imposer `client_max_body_size 12m` (limite de téléversement 10 Mio) ;
- éventuellement servir les fichiers statiques.

Exemple Nginx minimal :

```nginx
server {
  listen 443 ssl http2;
  server_name organix.example.com;
  client_max_body_size 12m;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $remote_addr;
  }
}
```

Gestion du processus : `systemd` ou `pm2` avec redémarrage automatique. Gardez `NODE_ENV=production`.

## Option B — Vercel + Supabase

La base fonctionne (Supabase PostgreSQL), mais **le stockage de fichiers doit être basculé** avant
mise en production : le système de fichiers Vercel est éphémère. `STORAGE_DRIVER=supabase` n'est pas
implémenté et l'application refuse explicitement de l'utiliser. Deux voies :

1. implémenter le pilote de stockage objet (mission dédiée, ~1 à 2 jours) ;
2. déployer sur un hébergeur à disque persistant (option A).

## Variables à renseigner en production

```
DATABASE_MODE=postgres
DATABASE_URL=postgresql://...           # pooler Supabase recommandé
DATABASE_SSL=true
AUTO_MIGRATE=false                      # lancer db:migrate dans le pipeline de déploiement
APP_URL=https://organix.example.com
AUTH_ALLOW_REGISTRATION=false           # invitation uniquement (recommandé)
AUTH_REQUIRE_EMAIL_VERIFICATION=false   # true seulement si un transport d'e-mail est opérationnel
MAIL_TRANSPORT=...                      # seul `console` est implémenté aujourd'hui
STORAGE_DRIVER=local
ORGANIX_STORAGE_DIR=/var/lib/organix/storage
```

## Liste de vérification avant d'annoncer « en production »

- [ ] PostgreSQL managé, sauvegardes automatiques activées et **restauration testée**
- [ ] `npm run db:migrate` exécuté, `npm run db:status` → `7/7` migrations
- [ ] `select relrowsecurity, relforcerowsecurity from pg_class where relname in ('customers','invoices','employees');` → `true` partout
- [ ] `npm run build`, `npm run lint`, `npm run typecheck`, `npm test` verts sur la version déployée
- [ ] HTTPS actif, `APP_URL` cohérent, cookies `Secure`
- [ ] Compte « Administrateur principal » nominatif créé, mot de passe fort, 2FA côté hébergeur si possible
- [ ] Aucune donnée de démonstration en base (`select count(*) from organizations where is_demo;` → 0)
- [ ] Répertoire de stockage persistant, sauvegardé, droits restreints
- [ ] Transport d'e-mail arbitré (sinon les invitations/réinitialisations restent manuelles)
- [ ] Supervision : disponibilité, erreurs serveur, espace disque base + fichiers
- [ ] Procédure de sauvegarde/restauration relue (voir `docs/sauvegarde-restauration.md`)

## Coûts (ordres de grandeur, à confirmer)

| Poste | Option gratuite | Première option payante |
| --- | --- | --- |
| Base | Supabase Free (500 Mo, pause après inactivité) | Supabase Pro ≈ 25 $/mois |
| Hébergement | Vercel Hobby / Render free (veille) | 5–20 $/mois (VPS) |
| Domaine | — | 10–20 $/an |
| E-mails | Console (aucun envoi réel) | Resend free (3 000/mois) puis ~20 $/mois |
| Stockage objet | Supabase Storage 1 Go | ~0,02 $/Go/mois |
| IA | Désactivée | selon fournisseur (hors périmètre) |

Aucun abonnement n'a été souscrit. Toute dépense doit être validée explicitement.
