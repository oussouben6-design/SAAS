# PROJECT STATUS — ORGANIX

Dernière mise à jour : **2 novembre 2026** (branch `arena/2ac590d2-saas`).

Ce document décrit l'état **réellement vérifié** du produit. Aucune fonctionnalité n'y est déclarée
comme opérationnelle sans test ou vérification HTTP associée. Les éléments non terminés sont
explicitement listés.

---

## 1. Synthèse

| Indicateur | Valeur vérifiée |
| --- | --- |
| Migrations SQL | 7/7 appliquées sans erreur (PGlite), idempotentes |
| Tables métier | 46 |
| Politiques RLS | 125 (RLS activée **et forcée** sur toutes les tables métier) |
| Permissions | 60 (16 modules × 7 actions), 6 rôles par défaut |
| `npm run typecheck` | ✅ 0 erreur |
| `npm run lint` | ✅ 0 erreur, 0 avertissement |
| `npm test` (Vitest) | ✅ **48 tests / 48** en 6 fichiers (~20 s) |
| `npm run build` | ✅ build de production, 40 routes |
| Parcours HTTP vérifié manuellement | ✅ 15 routes authentifiées répondent 200 (admin), refus de permission redirigé vers `/app/acces-refuse` |
| `npm run test:e2e` (Playwright) | ⚠️ **Non exécuté** — navigateurs non téléchargeables dans l'environnement |
| Déploiement | ⚠️ **Aucun** — voir `docs/deploiement.md` |

---

## 2. Modules : état exact

| Module | État | Ce qui fonctionne réellement | Ce qui manque |
| --- | --- | --- | --- |
| Authentification | ✅ Opérationnel | Inscription, connexion, déconnexion, sessions en base, révocation, mot de passe oublié/réinitialisation, vérification e-mail (jeton), limitation de débit | 2FA, transport SMTP/API (console uniquement) |
| Organisations & onboarding | ✅ Opérationnel | Création d'organisation (rôles, pipeline, catégories, modules), identité, devise, fuseau, départements | Suppression d'organisation, logo (colonne présente, upload non exposé) |
| Collaborateurs & invitations | ✅ Opérationnel | Invitation avec jeton, acceptation, rôles multiples, suspension, protection du propriétaire | Renvoi d'invitation en un clic, expiration paramétrable depuis l'UI |
| Rôles & permissions | ✅ Opérationnel | Matrice 16×7 éditable, verrouillage du rôle propriétaire, audit | Duplication de rôle, rôles personnalisés nommés librement (structure prête) |
| Tableau de bord | ✅ Opérationnel | KPI et graphiques calculés sur les données réelles, période sélectionnable, sections masquées selon permissions | Comparaison N-1, objectifs |
| CRM (clients) | ✅ Opérationnel | CRUD, contacts, interactions, catégories, filtres, fiche détaillée, export CSV | Import CSV, fusion de doublons |
| Prospection | ✅ Opérationnel | Prospects, pipeline, opportunités, conversion prospect → client | Relances automatiques, e-mails pré-rédigés |
| Projets | ✅ Opérationnel | CRUD, budget, avancement, équipe, jalons, documents liés, filtres | Gantt, dépendances, temps passé |
| Tâches | ✅ Opérationnel | CRUD, statuts, priorités, assignation, échéances, commentaires, `completed_at` automatique | Sous-tâches dans l'UI, récurrence, pièces jointes |
| Documents | ✅ Opérationnel | Dossiers, dépôt (10 Mio), catégories, rattachement, téléchargement contrôlé, suppression logique | Stockage objet, versioning, aperçu intégré |
| Rapports | ✅ Opérationnel | Projets/tâches/prospection, agrégats par période, export CSV | Rapports financiers détaillés, planification d'envoi |
| Journal d'audit | ✅ Opérationnel | Liste filtrable par organisation et entité, écriture transactionnelle | Export, rétention configurable |
| Notifications | ✅ Opérationnel | Liste, compteur non lus, marquage lu | Temps réel (Realtime), préférences |
| Recherche globale | ✅ Opérationnel | Clients, prospects, projets, tâches, documents | Recherche floue, indexation plein texte avancée |
| **Ressources humaines** | 🚧 En développement | Tables + RLS `hr:read` ; page d'explication honnête | Écrans employés, contrats, congés, présences, exports |
| **Finances** | 🚧 En développement | Tables + RLS `finance:read` ; les agrégats du tableau de bord utilisent ces tables | Facturation, devis, encaissements, dépenses, lettrage — **pas une comptabilité certifiée** |
| **Partenaires** | 🚧 En développement | Tables + permissions | Liste, fiches, conventions |
| **Communication** | 🚧 En développement | Tables `announcements`, `calendar_events` + permissions | Annonces, calendrier |
| **Assistant IA** | 🚧 Non disponible | Aucun appel externe, même si `OPENAI_API_KEY` est définie ; page d'état | Tout (cadrage, fournisseur, permissions, budget) |
| Multi-organisations | 🟡 Base prête | Schéma multi-tenant, cookie d'organisation active, changement d'organisation | Sélecteur visible en permanence, facturation/quotas SaaS |

Légende : ✅ vérifié · 🟡 partiel · 🚧 non utilisable (marqué comme tel dans l'interface).

---

## 3. Tests réellement exécutés

```
npx tsc --noEmit        → 0 erreur
npm run lint            → 0 erreur, 0 avertissement
npm test                → Test Files 6 passed (6) · Tests 48 passed (48) · ~20 s
npm run build           → succès, 40 routes, middleware 34,3 kB
```

Contenu des tests (base PostgreSQL réelle via PGlite, créée et migrée à la volée) :

| Fichier | Couverture |
| --- | --- |
| `tests/unit/permissions.test.ts` | 6 rôles, propriétaire = 60 permissions, lecteur en lecture seule |
| `tests/unit/validation.test.ts` | Schémas Zod partagés, montants en unité mineure (XOF/EUR) |
| `tests/unit/components.test.tsx` | Design system (RTL + jsdom) : rendu, variantes, accessibilité de base |
| `tests/integration/security.test.ts` | Isolation inter-organisations (lectures à 0 ligne), insertion croisée refusée, membre suspendu sans accès, RH inaccessible au lecteur, audit par organisation |
| `tests/integration/auth.test.ts` | Hachage scrypt, cycle de session, révocation, réinitialisation, vérification e-mail |
| `tests/integration/workflows.test.ts` | Projets/jalons, tâches et commentaires, conversion prospect → client, invitation → acceptation → rôles, protection du propriétaire, drapeau `is_demo` |

**Non exécutés** : les tests Playwright (`tests/e2e/*.spec.ts`) — navigateurs impossibles à
télécharger ici. Les assertions n'ont donc **pas** été validées.

---

## 4. Vérifications manuelles effectuées (serveur réel)

- 15 routes authentifiées testées en HTTP avec une session réelle (administrateur) : `/app`,
  `/app/clients`, `/app/projets`, `/app/taches`, `/app/documents`, `/app/parametres/organisation`,
  `/app/rapports`, `/app/rh`, `/app/finances`, `/app/partenaires`, `/app/communication`,
  `/app/assistant`, `/app/journal` → **200**.
- Avec une session **Lecteur** : `/app/clients`, `/app/finances`, `/app/rh`, `/app/journal`
  redirigent vers `/app/acces-refuse` avec le module et l'action demandés — aucune donnée chargée.
- Bandeau « Espace de démonstration » présent sur toutes les pages de l'organisation `is_demo`.
- `/` (page publique) et `/app` répondent 200 ; un 500 transitoire observé au **premier** rendu
  (compilation à froid de Next.js en développement) n'est pas reproductible.

---

## 5. Problèmes rencontrés et solutions

| Problème | Solution appliquée |
| --- | --- |
| Aucun accès réseau à PostgreSQL/Supabase | PGlite avec les mêmes migrations SQL ; tests d'intégration sur base réelle embarquée |
| RLS contournée par un superutilisateur | Rôle `organix_app` + `force row level security` |
| Deadlock `privileged()` dans une transaction `asMember()` | Découpage des invitations en trois phases indépendantes |
| `next build` échoue sur les variables/imports inutilisés | Nettoyage systématique, aucune règle désactivée |
| Erreurs de permission renvoyées en HTTP 500 | `requirePagePermission` redirige vers `/app/acces-refuse` ; les actions conservent `guard()` |
| Colonne `full_name` absente de `organization_members` | Jointure sur `profiles` dans les requêtes de membres |
| Absence de séparation réel/démo | Colonne `organizations.is_demo` (migration 0007), bandeau, `db:status`, `db:seed --force` ciblé |
| Deux organisations de démonstration créées par des seeds successifs | Slug imposé `organix-demo` + garde `is_demo` dans le script |

---

## 6. Limites connues et risques résiduels

1. **RLS de lecture inter-organisations uniquement** pour CRM/prospection/projets/partenaires : un
   rôle Lecteur n'ouvre pas la page Clients (refus serveur), mais une requête SQL exécutée avec sa
   session renverrait les lignes de son organisation. Les données RH et financières sont, elles,
   filtrées par permission en RLS. Décision produit à trancher (voir `docs/securite.md`, §Limites).
2. **Rapports et recherche** agrègent des modules que certains rôles n'ouvrent pas en lecture.
3. **E-mails** : transport `console` uniquement — en production, les invitations et
   réinitialisations doivent être transmises manuellement tant qu'un fournisseur n'est pas branché.
4. **Stockage** : disque local uniquement ; incompatible avec un hébergement à système de fichiers
   éphémère (Vercel) ou multi-instances.
5. **PGlite** : mono-processus ; ne pas lancer `db:seed`/`db:status` pendant que `npm run dev` tourne.
6. **Tests E2E non exécutés** ; pas de CI configurée.
7. **Aucun déploiement** : la mention « en production » ne doit pas être utilisée.
8. **Assistant IA** non implémenté ; aucun appel sortant.
9. **Multi-organisations** : interface de changement de contexte présente mais peu visible ; pas de
   facturation, quotas ou inscription d'organisation supplémentaire automatisée.
10. **Accessibilité** : structure sémantique et focus gérés, mais aucun audit RGAA/WCAG complet.
11. **Sauvegardes** : procédure documentée, **jamais testée sur une base réelle** (aucune base
    distante disponible).

---

## 7. Comptes de démonstration (base locale uniquement)

Générés par `npm run db:seed` : `demo.admin@organix.local`, `demo.directeur@organix.local`,
`demo.responsable@organix.local`, `demo.gestionnaire@organix.local`, `demo.employe@organix.local`,
`demo.lecteur@organix.local`. Mot de passe généré et affiché à l'exécution (ou
`ORGANIX_SEED_PASSWORD`). L'organisation est marquée `is_demo` et signalée par un bandeau permanent.

---

## 8. Prochaines missions recommandées (par priorité)

1. **Sauvegardes + environnements** : créer le projet Supabase de production, tester une
   restauration réelle, mettre en place la CI (lint + typecheck + build + tests).
2. **Transport d'e-mail** : brancher un fournisseur (Resend/Brevo/SMTP) pour rendre invitations et
   réinitialisations autonomes — dépend de la fourniture d'une clé par le commanditaire.
3. **Module Finances** : facturation, encaissements, dépenses, exports — en rappelant qu'il ne
   s'agit pas d'une comptabilité certifiée.
4. **Module RH** : employés, contrats, congés avec validation.
5. **Stockage objet** : implémenter le pilote `supabase`/S3 pour permettre un hébergement sans
   disque persistant.
6. **Partenaires + communication** ; puis **rapports avancés**.
7. **Assistant IA** : uniquement sur autorisation explicite (fournisseur, coûts, données permises).
8. **Durcissement sécurité** : trancher la lecture inter-modules, ajouter CSP, 2FA, purge des
   sessions expirées planifiée.

---

## 9. Décisions de périmètre à valider

- Inscription libre (`AUTH_ALLOW_REGISTRATION`) : ouverte en développement, à fermer en production.
- Vérification d'e-mail : désactivée tant qu'aucun transport réel n'existe.
- Suppression d'organisation : volontairement non exposée (opération destructrice).
- Aucun service payant souscrit ; aucune données envoyée à un tiers.
