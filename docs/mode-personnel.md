# Mode personnel — accès au site sans compte

**Objectif** : ouvrir le site et se retrouver directement dans l'application, **sans aucun
formulaire de compte, mot de passe ni code** — usage **personnel** du déploiement.

> ⚠️ **SÉCURITÉ — À LIRE AVANT D'ACTIVER.**
> Sur un domaine public, ce mode ouvre **toute l'application** (clients, factures, RH,
> documents) à **quiconque connaît l'adresse**. Le mode personnel est conçu pour un
> déploiement personnel. Si le site est en ligne, activez en plus une protection d'accès
> (ex. *Vercel → Project → Settings → Deployment Protection* / mot de passe du domaine),
> ou limitez l'accès au réseau concerné.

## Fonctionnement

- Activé **uniquement** si la variable d'environnement `PERSONAL_MODE=true` est définie sur le
  déploiement (au **build** pour le middleware — Redeploy après modification). Sans cette
  variable, le comportement est strictement identique au mode normal (connexion classique).
- Chaque requête est traitée comme le **propriétaire réel** du déploiement :
  - compte réel créé au premier accès si absent (`PERSONAL_OWNER_EMAIL`, défaut
    `personnel@organix.local`) — **sans identifiant de connexion** (ni mot de passe, ni
    identité Google) : il n'existe que pour le mode personnel ;
  - organisation réelle créée au premier accès si absente (nom `PERSONAL_ORG_NAME`, défaut
    « Mon espace Excellence 360 ») — **vide, réelle** (`is_demo=false`), onboarding déjà
    validé : aucun client, facture ou employé fictif n'y est injecté ;
  - rôle **Propriétaire** (toutes les permissions) dans cette organisation.
- En mode personnel :
  - `/` redirige directement vers `/app` ;
  - `/connexion`, `/inscription`, mot de passe oublié, vérification e-mail redirigent vers `/app` ;
  - le bouton « Se déconnecter » n'a aucun effet (rien à fermer) ;
  - aucun écran ne demande de créer un compte.
- Les **autres** déploiements (prévisualisations, CI, autres projets) restent en mode normal :
  c'est la variable qui fait foi, jamais le code.

## Configuration (Vercel, ou `.env.local` en local)

```bash
PERSONAL_MODE=true
# Optionnels — valeurs par défaut raisonnables
PERSONAL_OWNER_EMAIL=personnel@organix.local
PERSONAL_OWNER_NAME=Moi
PERSONAL_ORG_NAME=Mon espace Excellence 360
PERSONAL_ORG_CURRENCY=XOF
PERSONAL_ORG_TIMEZONE=Africa/Niamey
```

- En local (PGlite) : ajouter ces lignes dans `.env.local`, relancer le serveur, ouvrir
  http://localhost:3000/ — on arrive directement dans `/app`.
- En ligne (Vercel) : Project → Settings → Environment Variables (environnement **Production**),
  ajouter `PERSONAL_MODE=true` (+ éventuellement les autres), puis **Redeploy** (graver au
  build pour le middleware).

## Désactivation

Retirer `PERSONAL_MODE` (ou la passer à `false`) et redéployer : le site redemande la
connexion normale, inchangée.

## Limites assumées

- Toute personne connaissant l'adresse a **les pleins pouvoirs** sur l'espace personnel : ne
  jamais l'utiliser pour des données partagées ou sensibles sans protection d'accès en amont.
- Pas de multi-utilisateurs en mode personnel (un seul propriétaire ; les autres comptes ne
  sont pas accessibles sans leur mot de passe).
- Le compte personnel n'a **aucune** méthode de connexion classique, volontairement ; pour
  réactiver des comptes (vous-même ou des collaborateurs), retirez le mode personnel.
- Couverture : `tests/integration/personal-mode.test.ts`.
