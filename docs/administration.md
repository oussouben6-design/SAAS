# Administration

## Rôles par défaut

| Rôle | Rang | Portée réelle (résumé) |
| --- | --- | --- |
| **Administrateur principal** | 10 | Toutes les permissions (60). Seul rôle autorisé à administrer les rôles et l'organisation. Ne peut pas être suspendu ni rétrogradé. |
| **Directeur** | 20 | Lecture de tous les modules (sauf IA), création/validation opérationnelle, CRM et finances en écriture, export. |
| **Responsable de département** | 30 | Lecture étendue, écriture CRM/projets/tâches/documents/partenaires, validation RH, export. Pas d'administration des rôles. |
| **Gestionnaire** | 40 | Gestion quotidienne CRM, prospection, projets, tâches, documents, partenaires, communication. Lecture RH et rapports. |
| **Employé** | 50 | Lecture des projets, documents partagés, rapports ; création/mise à jour de ses tâches ; dépôt de documents. |
| **Lecteur** | 60 | Consultation seule : tableau de bord, projets, tâches, documents, communication, rapports. |

Les rôles sont **par organisation** et modifiables : *Paramètres → Rôles & permissions*. Le rôle
propriétaire ne peut pas être réduit (garde-fou serveur + test).

### Actions disponibles

`read`, `create`, `update`, `delete`, `validate`, `export`, `administer` — appliquées par module
(Tableau de bord, Organisation, Collaborateurs, Rôles, Clients, Prospection, Projets, Tâches,
Documents, RH, Finances, Partenaires, Communication, Rapports, Journal d'audit, Assistant IA).

## Gérer l'équipe

**Paramètres → Équipe**

1. « Inviter un collaborateur » : nom, e-mail, rôle(s), département, intitulé de poste.
   - L'invitation crée une ligne `organization_members` (`status = invited`) avec un jeton haché et
     une date d'expiration (7 jours).
   - Un e-mail est envoyé selon `MAIL_TRANSPORT`. En développement, le lien s'affiche dans la
     console du serveur ; il est aussi affiché dans le bloc « Invitations en attente » tant que le
     membre n'a pas accepté.
2. Le destinataire ouvre le lien, choisit son mot de passe, accepte : son profil est créé (ou
   rattaché à un profil existant) et ses rôles sont appliqués.
3. Statuts d'un membre : `invited`, `active`, `suspended`. Un membre suspendu perd immédiatement
   l'accès (aucune donnée visible).

Une invitation peut être annulée (suppression de la ligne) ; les invitations expirées sont
refusées à l'ouverture du lien.

## Départements

**Paramètres → Organisation → Départements.** Création, modification, suppression (refusée si des
membres y sont rattachés, sauf réaffectation). Les départements servent au filtrage RH et à
l'organisation des annonces.

## Modules

**Paramètres → Modules.** Activez ou désactivez les modules de votre organisation. Un module
désactivé disparaît de la navigation **et** son accès direct affiche une page explicative ; les
données existantes sont conservées. Les modules RH, Finances, Partenaires, Communication et IA sont
livrés désactivables mais marqués « En développement » : les activer n'ajoute pas de
fonctionnalités d'écriture.

## Journal d'audit

**Journal d'audit** (permission `audit:read`, réservée à l'administrateur principal par défaut
puis attribuable). Chaque entrée contient : date, acteur (nom + e-mail), action technique
(ex. `customer.update`), entité, résumé lisible, métadonnées (champs modifiés, identifiants).
Le journal est filtré par organisation et paginé ; il n'est pas modifiable depuis l'interface.

## Organisation et paramètres

- **Identité** : nom commercial, raison sociale, secteur, coordonnées, devise, fuseau horaire,
  langue. La devise sert au formatage des montants ; en changer n'altère pas les montants stockés
  (unités mineures) mais modifie leur interprétation — vérifiez avant de basculer.
- **Secteur** : champ libre, aucun vocabulaire sectoriel n'est imposé par le produit.
- **Suppression d'organisation** : non exposée dans l'interface (opération destructrice, à réaliser
  avec l'accompagnement de l'éditeur).

## Bonnes pratiques d'administration

1. Un seul compte « Administrateur principal » nominatif ; jamais de compte partagé.
2. Accorder `roles:administer` à une seule personne de confiance.
3. Vérifier le journal d'audit après chaque modification de rôles.
4. Suspendre (ne pas supprimer) un collaborateur qui quitte l'organisation : l'historique reste
   lisible et attribué.
5. Ne jamais désactiver un module dont dépendent des exports réglementaires sans prévenir les
   utilisateurs.
