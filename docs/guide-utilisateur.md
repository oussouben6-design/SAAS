# Guide utilisateur

Ce guide décrit **uniquement des écrans qui fonctionnent**. Les modules encore en développement sont
listés à la fin, avec ce qu'ils font réellement aujourd'hui.

## Créer votre compte (connexion réelle)

1. Ouvrez `/inscription`, saisissez votre nom, votre adresse e-mail et un mot de passe (10 caractères
   minimum ; utilisez une phrase de passe).
2. Vous êtes connecté et redirigé vers la configuration de votre organisation (nom, secteur, pays,
   ville, devise, fuseau, langue).
3. Votre espace est vide et réel : chaque chiffre affiché proviendra de vos propres saisies.

Les comptes `@organix.local` et l'organisation « démonstration » sont réservés à l'exploration :
bandeau visible, données fictives, mot de passe public. Un espace réel n'affiche jamais ce bandeau.

## Se connecter

- `/inscription` crée un compte (si `AUTH_ALLOW_REGISTRATION=true`), puis `/onboarding` crée votre
  organisation : nom, secteur, devise, fuseau, départements. Cette étape génère les 6 rôles, le
  pipeline commercial, les catégories financières et active les modules de base.
- `/connexion` : e-mail + mot de passe. Après 5 échecs, la connexion est temporairement limitée.
- `/mot-de-passe-oublie` puis `/reinitialiser-mot-de-passe` : lien à usage unique, valable une heure.
- Si vous recevez une invitation, ouvrez le lien reçu : vous choisissez votre mot de passe et
  rejoignez l'organisation avec le(s) rôle(s) prévu(s).

## Tableau de bord (`/app`)

Affiche des chiffres **calculés à partir de vos données** :

- projets (total, actifs, terminés), tâches (répartition par statut, en retard), clients et
  prospects nouveaux sur la période, opportunités ouvertes et montant cumulé ;
- finances : recettes encaissées, dépenses, impayés (si votre rôle dispose de `finance:read`,
  sinon un encart explique la restriction) ;
- activité récente (journal d'audit si autorisé), échéances à venir (tâches, jalons, événements) ;
- graphiques (répartition des tâches, évolution mensuelle recettes/dépenses, charge par personne).

Sélecteur de période : 7 jours, 30 jours, 90 jours, 12 mois, depuis le début. Si une base est
vide, les cartes affichent zéro et un message d'amorçage : aucun chiffre d'exemple n'est injecté.

## Clients (`/app/clients`)

- Liste paginée avec recherche plein texte, filtres statut/catégorie/propriétaire, tri.
- Fiche client : coordonnées, catégorie, propriétaire, contacts, interactions, projets liés,
  documents rattachés, notes.
- Création / modification / archivage (suppression logique). Export CSV (`crm:export`).
- Catégories de clients : configurables dans la fiche client (Entreprise, Institution, ONG…).

## Prospection (`/app/prospection`)

- Prospects (piste) : nom, société, source, statut (`new`, `contacted`, `qualified`,
  `unqualified`, `converted`), prochaine relance, notes.
- Conversion d'un prospect en client : action explicite, une seule fois, avec lien conservé.
- Opportunités : montant, étape du pipeline, probabilité, date de clôture prévue, propriétaire.
- Pipeline : étapes par défaut Prospection → Qualification → Proposition → Négociation →
  Gagnée / Perdue ; les totaux sont calculés sur vos données.

## Projets (`/app/projets`)

- Liste filtrable par statut (`planning`, `active`, `on_hold`, `completed`, `cancelled`), priorité,
  responsable, client.
- Fiche projet : objectifs, budget, avancement, dates, membre de l'équipe, jalons (coche de
  réalisation), tâches liées, documents.
- Contrôles de cohérence : date de fin ≥ date de début, avancement entre 0 et 100.

## Tâches (`/app/taches`)

- Vue liste et filtres : projet, statut (`todo`, `in_progress`, `review`, `done`, `blocked`),
  priorité, assigné, échéance.
- Changement de statut en un clic ; passer en `done` renseigne automatiquement la date de
  réalisation. Commentaires horodatés par tâche.
- « Mes tâches » : celles dont vous êtes l'assigné.

## Documents (`/app/documents`)

- Dossiers, dépôt de fichier (10 Mio max par défaut), catégories (contrat, facture, rapport, RH,
  projet, juridique, autre), description, rattachement à une entité (client, projet, tâche…).
- Téléchargement contrôlé : la permission et l'appartenance à l'organisation sont vérifiées à
  chaque requête.
- Suppression logique : le fichier reste sur le disque jusqu'à une purge administrative.

## Rapports (`/app/rapports`)

- Projets par statut, tâches terminées par mois, répartition des tâches, statistiques de
  prospection, et synthèse sur la période choisie.
- Export CSV (`reports:export`).

## Recherche globale

La barre de recherche de l'en-tête interroge clients, prospects, projets, tâches, documents,
partenaires, employés (nom, poste, e-mail) et factures (numéro, client) de **votre organisation**,
**uniquement dans les modules auxquels vous avez accès**, et renvoie des liens directs. Aucun résultat n'est inventé : une recherche
sans correspondance affiche un état vide.

## Maintenance (exploitant)

`npm run db:maintenance` purge les sessions expirées depuis plus de 30 jours et les jetons d'action
expirés depuis plus de 7 jours. À planifier quotidiennement (cron) ; aucune donnée métier n'est
supprimée.

## Notifications

Liste des notifications qui vous sont destinées (échéances, affectations) avec lien vers l'objet.
Le compteur de l'en-tête reflète les éléments non lus ; le marquage comme lu est persistant.

## Connexion

À chaque connexion par mot de passe, après votre mot de passe (et après le code de votre
  application d'authentification si la double authentification est activée), un **code à 6 chiffres**
  vous est envoyé par e-mail à l'adresse de votre compte. Saisissez-le sur la page de connexion :
  il expire dans 10 minutes et n'est utilisable qu'une fois. En développement, aucun e-mail n'est
  envoyé : le code s'affiche à l'écran. Si vous n'avez pas reçu le code, vérifiez vos courriers
  indésirables, puis réessayez depuis « Recommencer la connexion ».
  **Avec « Continuer avec Google »**, cette étape n'est pas nécessaire : Google vérifie déjà votre
  adresse et la session s'ouvre directement (la double authentification reste demandée si elle est
  activée).
  **« Explorer la démo — sans compte »** : ouvre instantanément une session sur une organisation
  **fictive** (aucune donnée réelle, aucune inscription). Idéal pour découvrir l'interface ; les
  données sont partagées entre les visiteurs et peuvent être supprimées à tout moment.

## Paramètres

- **Organisation** : identité, devise, fuseau, langue, départements, **liste de vos organisations
  et bascule d'organisation active**, création d'une organisation supplémentaire.
- **Équipe** : invitations, rôles, départements, suspension.
- **Rôles & permissions** : matrice par module/action ; le rôle propriétaire est verrouillé.
- **Modules** : activation/désactivation par module.
- **Profil** : nom, téléphone, intitulé, changement de mot de passe (révoque les autres sessions),
  **sessions actives** (navigateur, IP, dernière activité) avec révocation individuelle ou de tous
  les autres appareils.
- **Sécurité** : activation de la **double authentification** (application d'authentification
  compatible TOTP). Le secret s'ajoute manuellement (ou via le lien `otpauth://`) ; un premier code
  valide confirme l'activation et affiche **10 codes de secours** à conserver hors ligne. Ensuite,
  chaque connexion demande le mot de passe **puis** un code à 6 chiffres (ou un code de secours,
  utilisable une seule fois). Avec une connexion Google, la double authentification reste demandée
  (le code à 6 chiffres par e-mail, non). La désactivation exige le mot de passe actuel et déconnecte les autres
  sessions. Si l'écran indique que la fonctionnalité est indisponible, l'administrateur doit définir
  `MFA_ENCRYPTION_KEY` (voir `docs/configuration.md`).

## Finances (`/app/finances`)

Onglets : **Factures**, **Devis**, **Dépenses**, **Recettes**, **Catégories**.

- **Devis** : création avec une première ligne, ajout de lignes, statuts `brouillon → envoyé →
  accepté/refusé/expiré`. Un devis accepté se transforme en **facture brouillon** (une seule fois).
- **Factures** : numérotation automatique `FAC-AAAA-NNNN`, lignes, TVA en taux, totaux HT/TVA/TTC
  recalculés côté serveur. Cycle : `brouillon → envoyée → (partielle) → payée` ou `annulée`.
  Une facture payée ou annulée est **verrouillée**.
- **Encaissements** : montant plafonné au solde restant, moyen de paiement, référence. Un
  encaissement crée automatiquement une **recette** liée. Le statut de la facture se déduit des
  paiements (jamais saisi à la main pour « payée »).
- **Dépenses** : saisie avec justificatif texte, validation ou refus par un **autre** utilisateur
  (auto-validation interdite). Une dépense validée ne peut plus être supprimée.
- **Exports CSV** (`finance:export`) : factures, devis, dépenses, recettes.

> ⚠️ Ce module **n'est pas une comptabilité certifiée** : pas de lettrage bancaire, pas de
> déclaration de TVA, pas de conformité fiscale garantie.

## Ressources humaines (`/app/rh`)

Onglets : **Employés**, **Congés**, **Présences**.

- **Dossiers employés** : identité, poste, département, manager, type de contrat, dates, statut
  (actif, en congé, suspendu, sorti), **salaire de référence** (montant indicatif, hors charges).
  Archivage logique via la fiche détaillée.
- **Fiche employé** : édition, contrats (référence, type, période, salaire, signature), congés,
  présences, actions rapides de statut.
- **Congés** : demande (type, période, nombre de jours), **refus des chevauchements**, validation ou
  refus avec commentaire. L'approbation bascule l'employé « en congé ».
- **Présences** : une ligne par employé et par jour (`présent`, `absent`, `retard`, `congé`,
  `télétravail`), heures d'arrivée/départ.
- **Export CSV** (`hr:export`).

> ⚠️ **Aucune paie n'est calculée** : ni bulletin de salaire, ni cotisations, ni déclaration
> sociale. Le salaire de référence sert uniquement d'indication.

## Partenaires (`/app/partenaires`)

- Liste filtrable (type, statut, recherche) : fournisseurs, institutions, distributeurs, ONG.
- Fiche partenaire : coordonnées, notes internes, **contacts** (un seul contact principal à la
  fois), **conventions** (référence, période validée, statut).
- Archivage logique du partenaire (les conventions restent en base et l'action est journalisée).

## Communication (`/app/communication`)

- **Annonces** : publication avec audience (**toute l'organisation**, **un département**,
  **administrateurs uniquement**), épinglage en tête, date d'expiration. Le filtrage par audience
  est appliqué en base (RLS) : un collaborateur ne voit pas les annonces qui ne le concernent pas.
- **Calendrier** : événements partagés (titre, début/fin, lieu, journée entière, projet lié,
  visibilité organisation/département/privé).
- **Pas de messagerie instantanée** ni de notifications temps réel : hors périmètre de cette étape.

## Modules « En développement »

| Module | Ce qui existe réellement | Ce qui reste à faire |
| --- | --- | --- |
| **Assistant IA** | Rien n'appelle de service externe, même si une clé est présente | Cadrage, permissions, fournisseur, coûts — sur autorisation explicite |

## Signaler un problème

Notez l'écran, l'heure, l'action et le message affiché. Les erreurs techniques sont volontairement
génériques à l'écran ; le détail est dans les journaux du serveur (`console` du processus Node).
