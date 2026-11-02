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

## Authentification

- Mots de passe hachés avec **scrypt** (`N=2^15, r=8, p=1`), sel aléatoire de 16 octets, paramètres
  stockés avec l'empreinte (évolution possible sans invalidation).
- Politique de mot de passe : 12 caractères minimum, majuscule, minuscule, chiffre (Zod partagé
  client/serveur).
- Jetons (sessions, vérification d'e-mail, réinitialisation, invitations) : aléatoires, **stockés
  hachés**, à usage unique pour les jetons d'action, avec expiration.
- Changement ou réinitialisation de mot de passe → **toutes les autres sessions sont révoquées**.
- Le middleware ne fait qu'une redirection sur présence de cookie : **aucune décision de sécurité**
  n'y est prise.

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
3. **Pas encore** : 2FA, révocation administrateur de session, politique de complexité renforcée,
   chiffrement au repos applicatif (la base managée le fournit), en-têtes CSP stricts.
4. **Transport d'e-mail** : `console` (développement) et `resend` (HTTP) sont implémentés ; `smtp`
   ne l'est pas. Sans clé Resend, la vérification d'e-mail ne doit pas être exigée en production.
   L'envoi Resend n'a pas été testé contre un compte réel dans cet environnement.
5. **Playwright** : les parcours E2E existent mais n'ont pas été exécutés dans cet environnement
   (navigateurs non téléchargeables). Voir `PROJECT_STATUS.md`.

## Signaler une vulnérabilité

Contact : à définir par le commanditaire (adresse de sécurité). En attendant, ne créez pas
d'issue publique contenant des données sensibles ou un scénario d'exploitation détaillé.
