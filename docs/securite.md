# Sécurité

## Modèle de défense

| Couche | Ce qu'elle protège | Où |
| --- | --- | --- |
| Cookie de session `httpOnly`, `SameSite=Lax`, `Secure` en production | Vol de session via JavaScript / CSRF de base | `src/lib/auth/cookies.ts` |
| Validation de session en base (jeton haché, expiration, révocation) | Sessions forgées, déconnexion, changement de mot de passe | `src/lib/auth/service.ts` |
| Membre actif + organisation active | Accès d'un compte suspendu ou retiré | `src/lib/server/context.ts` |
| Permissions granulaires (16 modules × 7 actions) | Accès aux pages et aux Server Actions | `requirePagePermission`, `requirePermission`, `guard` |
| RLS `force` + rôle `organix_app` | Fuite entre organisations, y compris en cas de bug applicatif | `supabase/migrations` |
| Politiques renforcées `hr:read` / `finance:read` | Données RH et financières non accessibles aux rôles non habilités, même par une requête SQL directe | migrations 0005 |
| Journal d'audit (même transaction que l'écriture) | Traçabilité et détection | `src/lib/server/audit.ts` |
| Suppression logique (`deleted_at`) filtrée dans les requêtes métier de chaque module | Enregistrements archivés absents des listes et exports | `src/modules/**/service.ts` |
| Limitation de débit sur connexion / inscription / réinitialisation | Bourrage d'identifiants, envoi massif | `src/lib/rate-limit.ts` |
| Gestion des sessions par l'utilisateur (liste, révocation individuelle, autres appareils) | Sessions oubliées sur un appareil partagé | `src/lib/auth/service.ts`, `/app/parametres/profil` |
| Code de connexion par e-mail (OTP), à usage unique, 10 min, 5 essais | Mot de passe compromis seul insuffisant pour ouvrir une session ; code envoyé à la boîte mail du compte | `src/lib/auth/service.ts`, table `login_challenges`, `/connexion` |
| En-têtes de sécurité (CSP, HSTS en production, COOP, `nosniff`, `Permissions-Policy`) | Inclusion de ressources tierces, sniffing MIME, clickjacking partiel | `next.config.ts` |

## Authentification

- Mots de passe hachés avec **scrypt** (`N=2^15, r=8, p=1`), sel aléatoire de 16 octets, paramètres
  stockés avec l'empreinte (évolution possible sans invalidation).
- Politique de mot de passe : 12 caractères minimum, majuscule, minuscule, chiffre (Zod partagé
  client/serveur).
- Jetons (sessions, vérification d'e-mail, réinitialisation, invitations) : aléatoires, **stockés
  hachés**, à usage unique pour les jetons d'action, avec expiration.
- Changement ou réinitialisation de mot de passe → **toutes les autres sessions sont révoquées**.
- Chaque utilisateur voit ses **sessions actives** (navigateur, IP, dernière activité, expiration) et
  peut en révoquer une ou toutes les autres. Une session ne peut être révoquée que par son
  propriétaire (filtre `user_id` en base) — vérifié par test.
- Le middleware ne fait qu'une redirection sur présence de cookie : **aucune décision de sécurité**
  n'y est prise.

### Connexion avec Google (OAuth 2.0 / OpenID Connect)

- Flux **Authorization Code + PKCE (S256)**, `state` anti-CSRF et `nonce` anti-rejeu, conservés
  10 minutes dans un cookie `httpOnly` limité au chemin `/api/auth/google` (`src/lib/auth/google.ts`).
- Le jeton d'identité est vérifié intégralement avant toute session : signature **RS256** contre
  les clés publiques Google (JWKS, mises en cache selon `Cache-Control`), émetteur, **audience**
  (= notre `GOOGLE_CLIENT_ID`), expiration (dérive tolérée 5 min), nonce, et
  **`email_verified` obligatoire** — un jeton forgé ou rejoué est refusé (tests unitaires avec
  signature RSA réelle : `tests/unit/google.test.ts`).
- Liaison de compte : identifiant Google stable (`sub`, table `user_identities`) ; à la première
  connexion, un compte existant avec la même adresse **vérifiée par Google** est lié
  automatiquement. Un compte créé via Google n'a pas de mot de passe (il peut en définir un
  ensuite depuis son profil). Comptes désactivés refusés ; `AUTH_ALLOW_REGISTRATION=false`
  bloque la création via Google comme via le formulaire.
- La **double authentification TOTP reste exigée après Google** (même défi que post-mot de passe,
  transmis par cookie `httpOnly` de 5 minutes) : Google ne contourne pas le second facteur.
- **« Vérification Google en un clic »** (11 nov. 2026) : après une connexion Google, le code
  e-mail `login_challenges` n'est **pas** exigé par défaut — le jeton d'identité vérifié tient lieu
  de preuve d'adresse. `AUTH_LOGIN_OTP_GOOGLE=true` rétablit le code e-mail après Google également ;
  la chaîne complète devient alors Google → (TOTP si actif) → code e-mail, jamais moins.
- Aucun jeton Google (accès/actualisation) n'est conservé : seul le jeton d'identité est consommé
  puis oublié (`access_type=online`).

### Code de connexion par e-mail (OTP)

- **Actif par défaut** (`AUTH_LOGIN_OTP` non défini ou `true`) pour le mot de passe : après le mot
  de passe — et après la double authentification TOTP le cas échéant — aucune session n'est créée
  tant que le code à 6 chiffres envoyé à l'adresse du compte n'est pas saisi. Après une connexion
  **Google**, ce second verrou n'est **pas** déclenché par défaut (voir « Vérification Google en un
  clic ») ; il reste exigé si `AUTH_LOGIN_OTP_GOOGLE=true`. Le mot de passe n'a donc jamais de chemin
  de connexion contournant le code.
- Le code est généré avec un aléa cryptographique (`crypto.randomInt`), conservé uniquement en
  **empreinte scrypt** (`algorithm$salt$hash`), à **usage unique**, valable **10 minutes**, avec un
  maximum de **5 tentatives** (le défi est ensuite invalidé, même pour le bon code). Les défis
  expirés ou consommés sont purgés à chaque émission.
- Le jeton opaque du défi (32 octets) suit le navigateur via un champ de formulaire (ou un cookie
  `httpOnly` de 10 minutes après un retour Google) ; il ne donne accès qu'à l'étape de saisie du code.
- Délivrance : transport `console` en développement (aucun e-mail ne part ; le code est **affiché à
  l'écran** sur la page de connexion) ; en production, `MAIL_TRANSPORT=resend` + `RESEND_API_KEY`
  sont requis — `npm run env:check` refuse le déploiement sinon (le code n'est jamais journalisé ni
  affiché en production).
- `AUTH_LOGIN_OTP=false` désactive ce verrou (dernier recours, incidents) ; la double
  authentification TOTP éventuelle reste exigée. Chaque activation de session reste journalisée.
- Couverture : `tests/integration/login-otp.test.ts` (émission, refus sans session, hash en base,
  5 essais max, usage unique, chaîne mot de passe → 2FA → OTP, `AUTH_LOGIN_OTP=false`) et
  `tests/integration/google-auth.test.ts` (session directe en un clic après Google,
  `AUTH_LOGIN_OTP_GOOGLE=true`, chaîne Google → 2FA → session ou code e-mail).

## Authentification : mode démo public

- **« Explorer la démo — sans compte »** (bouton public sur `/connexion`) : aucune identité
  n'est requise ; une session est ouverte sur une organisation **fictive** isolée (`is_demo`,
  bandeau permanent « Espace de démonstration »). Le profil mutualisé `demo.visiteur@organix.local`
  ne possède **aucun identifiant de connexion** et n'appartient à aucune organisation réelle ;
  la RLS l'empêche d'atteindre toute donnée hors de la démo.
- L'organisation de démo est **réutilisée si elle existe** (jeux de données seed), sinon elle est
  créée à la première ouverture avec trois clients fictifs ; l'accès est limité à **20 ouvertures
  par adresse IP et par 15 minutes** (limitation de débit). Les données y sont **partagées entre
  visiteurs** — c'est une démo, pas un espace de travail.
- Couverture : `tests/integration/demo-mode.test.ts` (session valide sans compte, organisation
  `is_demo` unique et idempotente, aucun identifiant, aucun accès aux organisations réelles).

## Autorisation

- Le catalogue fait foi en base (`permissions`, `role_permissions`) ; `src/lib/permissions` en est
  le miroir TypeScript (testé).
- Les pages vérifient `requirePagePermission` **avant** tout chargement de données ; un refus
  redirige vers `/app/acces-refuse` avec l'explication, sans exposer de données.
- Les Server Actions appellent `requirePermission` puis revalident l'entrée avec Zod. Un rôle sans
  permission reçoit `{ ok: false }` et aucune écriture n'a lieu.
- Règles de protection du propriétaire : impossible de suspendre, retirer ou réduire le rôle
  propriétaire (testé).

## Données sensibles

- Aucune clé `service_role` n'est utilisée côté client. Les variables `SUPABASE_*` ne sont
  nécessaires qu'en mode `STORAGE_DRIVER=supabase` (usage serveur exclusif) ; le bucket reste privé
  et la lecture passe par `/api/documents/[id]` après contrôle des permissions.
- Les erreurs renvoyées au navigateur ne contiennent ni SQL, ni trace, ni secret.
- Les fichiers sont servis par `/api/documents/[id]` après vérification de la permission
  `documents:read` et de l'organisation ; les chemins sont normalisés et vérifiés (pas de
  traversée de répertoire).
- Les exports CSV (clients, RH, finances, rapports) exigent les permissions `crm:export`,
  `hr:export`, `finance:export` / `reports:export`.

## Suppression logique et RLS (décision documentée)

L'archivage se fait par `deleted_at` : la ligne reste en base, l'audit la conserve et aucune donnée
métier n'est détruite. Les politiques SELECT n'incluent **pas** `deleted_at is null`, car PostgreSQL
évalue la politique SELECT sur la nouvelle version de la ligne lors d'un `UPDATE` : un UPDATE qui
renseigne `deleted_at` serait alors rejeté (« new row violates row-level security policy »), rendant
l'archivage impossible.

Conséquence assumée : RLS garantit l'isolation entre organisations et les permissions
(`hr:read`, `finance:read`…), tandis que l'exclusion des enregistrements archivés est assurée par
les requêtes (`deleted_at is null`). Des tests d'intégration vérifient qu'un élément archivé
disparaît des listes et reste inaccessible par son identifiant (clients, employés, partenaires,
annonces) ; les listes des autres modules appliquent le même filtre. La migration
`0008_soft_delete_policies.sql` porte cette décision et son commentaire d'origine.

## Limites connues (à traiter)

1. **Lecture inter-modules** : la RLS des modules non sensibles (CRM, prospection, projets,
   partenaires) s'appuie sur l'appartenance à l'organisation, pas sur `<module>:read`. Un rôle
   Lecteur n'a pas accès à la page Clients (contrôlée côté serveur), mais une requête SQL exécutée
   avec sa session renverrait les lignes de son organisation. Les données RH et financières sont,
   elles, filtrées par permission au niveau RLS. Décision à trancher : soit généraliser
   `<module>:read` en RLS (impact : noms de clients masqués dans les projets pour les employés),
   soit conserver la lecture intra-organisation et documenter ce choix produit.
2. **Rapports et recherche globale** agrègent des données de modules que certains rôles n'ouvrent
   pas en lecture. Les chiffres affichés restent ceux de l'organisation ; aucune donnée d'une autre
   organisation n'est accessible.
3. **Pas encore** : révocation de session par un administrateur, purge planifiée des sessions
   expirées, chiffrement au repos applicatif (la base managée le fournit).
   La double authentification TOTP est implémentée (voir ci-dessous) mais reste **facultative** :
   aucun rôle n'est encore contraint de l'activer. Le code OTP par e-mail, lui, est **exigé par
   défaut** pour le mot de passe (désactivable via `AUTH_LOGIN_OTP=false`) ; après Google il n'est
   pas exigé par défaut (`AUTH_LOGIN_OTP_GOOGLE=false`).
   **CSP** : appliquée en production, mais sans nonce (Next.js injecte des scripts inline) —
   `script-src 'unsafe-inline'` reste donc nécessaire. Elle bloque les ressources tierces,
   `<object>`, `<base>` détourné et les formulaires externes, pas les injections inline.
4. **Transport d'e-mail** : `console` (développement) et `resend` (HTTP) sont implémentés ; `smtp`
   ne l'est pas. Sans clé Resend, la vérification d'e-mail ne doit pas être exigée en production —
   et le code de connexion OTP (actif par défaut) empêcherait toute connexion : `env:check` bloque
   le déploiement dans ce cas. L'envoi Resend n'a pas été testé contre un compte réel dans cet
   environnement.
5. **Playwright** : les parcours E2E existent mais n'ont pas été exécutés dans cet environnement
   (navigateurs non téléchargeables). Voir `PROJECT_STATUS.md`.

## Double authentification (TOTP)

- `Paramètres → Sécurité` permet à chaque utilisateur d'activer un second facteur compatible
  Google Authenticator / Authy / 1Password (RFC 6238, HMAC-SHA1, 30 s, 6 chiffres, ±1 pas de tolérance).
- Le secret est chiffré en **AES-256-GCM** avec `MFA_ENCRYPTION_KEY` (32 octets base64) ; la base ne
  contient donc pas de secret exploitable seule. Sans clé, l'activation est refusée explicitement.
- 10 codes de secours à usage unique sont générés à la confirmation, stockés **hachés** (scrypt).
- Une fois la 2FA confirmée, `authenticate()` ne crée **aucune session** : il émet un défi
  (jeton unique, 5 minutes, 5 essais maximum, stocké haché) et la session n'est ouverte qu'après
  vérification du code TOTP ou d'un code de secours (`completeMfaLogin`).
- La désactivation exige le mot de passe actuel, supprime les défis en cours et révoque toutes les
  autres sessions.
- Les événements `auth.mfa.enable` / `auth.mfa.disable` sont journalisés dans `audit_logs`.
- Couverture : `tests/unit/totp.test.ts` (vecteurs RFC 6238) et `tests/integration/mfa.test.ts`
  (chiffrement, activation, défi, rejeu, codes de secours, désactivation).

## Signaler une vulnérabilité

Contact : à définir par le commanditaire (adresse de sécurité). En attendant, ne créez pas
d'issue publique contenant des données sensibles ou un scénario d'exploitation détaillé.
