# Mettre le site en ligne — la checklist unique

**Objectif** : ouvrir ton domaine et arriver **directement dans ton espace** — sans aucun formulaire
de compte, mot de passe ni code (mode personnel). **~10 minutes, zéro ligne de code.**

> Valable sur **Vercel** et sur **Netlify**. Tu ne sais pas lequel héberge ton domaine ?
> Netlify : [app.netlify.com](https://app.netlify.com) → *Sites* liste ton site et son URL.
> Vercel : [vercel.com/dashboard](https://vercel.com/dashboard) → ton projet → *Domains* affiche l'URL.

## Ce que le dépôt fait déjà (rien à préparer)

- `main` contient : retrait du mode démo, **mode personnel** (`PERSONAL_MODE`), vue consolidée aux
  couleurs du logo, préflight `env:check` compatible avec le mode personnel (pas de Resend exigé).
- `netlify.toml` prêt (Node 22, publish `.next`) ; Vercel détecte Next.js automatiquement.
- Supabase `opnlvqwbevnivfjpbrxa` : **25 migrations déjà appliquées**, service sain (eu-west-3).

## Les 5 étapes

1. **Un seul site** pour le dépôt `oussouben6-design/SAAS`. Les imports multiples créent des
   variables et des déploiements indépendants — c'est la cause n°1 des « mises à jour non visibles ».
2. **Production branch = `main`** (sinon tes merges ne sortent jamais sur ton domaine).
3. **Variables d'environnement** (portée **production** ; secrets cochés comme tels) :

   ```
   DATABASE_URL=postgresql://postgres.opnlvqwbevnivfjpbrxa:<MOT_DE_PASSE_DB>@aws-0-eu-west-3.pooler.supabase.com:6543/postgres
   SUPABASE_URL=https://opnlvqwbevnivfjpbrxa.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<console Supabase → Settings → API → service_role>
   PERSONAL_MODE=true
   ```

   `<MOT_DE_PASSE_DB>` = mot de passe créé avec le projet Supabase
   (oublié ? **Settings → Database → Reset database password**).
   Optionnel mais recommandé : `MFA_ENCRYPTION_KEY` (`openssl rand -base64 32`), `MAINTENANCE_SECRET`.
4. **Déployer** (*Deploy site* sur Netlify, ou sur Vercel *Deployments → ⋯ → Redeploy* **après** tout
   changement de variables — sans ça, la variable n'existe pas pour le site). Attends le statut
   **Ready / READY**.
5. Ouvre ton domaine **en navigation privée** → tu dois arriver sur
   **« Mon espace Excellence 360 »**, directement dans l'application, sans aucun écran de compte.

> La première ouverture crée automatiquement ton compte réel (`personnel@organix.local`) et ton
> organisation (vide). Aucune inscription.

## « Les mises à jour ne sont pas visibles » — diagnostic en 6 lignes

| Symptôme | Cause la plus probable | Remède |
| --- | --- | --- |
| Page de connexion d'avant les merges | Domaine branché sur **le mauvais site / projet** du dépôt | Garde un seul site, branche `main`, ou corrige la *production branch* |
| Toujours demandé de créer un compte malgré `PERSONAL_MODE=true` | Variables modifiées **sans Redeploy**, ou ajoutées dans la portée *Preview* seulement | Recoche **production**, puis **Trigger deploy → Clear cache and deploy** |
| Le build échoue sur `env:check` | Variable manquante (voir le message : il liste exactement quoi) | Ajoute-la — ne corrige rien dans le dépôt |
| Page d'erreur / 500 | `DATABASE_URL` en IPv6 (connexion directe) ou mot de passe incorrect | Utilise le **pooler** (port 6543) et `Reset database password` si besoin |
| Page blanche / 404 alors qu'il marchait hier | Build déployé depuis l'ancienne branche | `main` partout, puis redéploie |
| Toujours l'ancienne page en navigation privée | Domaine personnalisé jamais rattaché au nouveau déploiement | Vérifie *Domains* du site/projet (voir encadré d'en-tête) |

## Revenir à la connexion normale

Retire `PERSONAL_MODE` des variables (ou mets `false`) → **redéploie**. Le site redemande la
connexion classique (inscription → organisation).

## Les 3 règles d'or

1. **Un seul site** par plateforme, branche **`main`**.
2. **Toute** modification de variable est suivie d'un **redéploiement**.
3. Toujours vérifier en **navigation privée** — jamais dans l'onglet déjà ouvert.
