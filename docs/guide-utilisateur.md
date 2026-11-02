# Guide utilisateur

Ce guide décrit **uniquement des écrans qui fonctionnent**. Les modules encore en développement sont
listés à la fin, avec ce qu'ils font réellement aujourd'hui.

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

La barre de recherche de l'en-tête interroge clients, prospects, projets, tâches et documents de
**votre organisation** et renvoie des liens directs. Aucun résultat n'est inventé : une recherche
sans correspondance affiche un état vide.

## Notifications

Liste des notifications qui vous sont destinées (échéances, affectations) avec lien vers l'objet.
Le compteur de l'en-tête reflète les éléments non lus ; le marquage comme lu est persistant.

## Paramètres

- **Organisation** : identité, devise, fuseau, langue, départements.
- **Équipe** : invitations, rôles, départements, suspension.
- **Rôles & permissions** : matrice par module/action ; le rôle propriétaire est verrouillé.
- **Modules** : activation/désactivation par module.
- **Profil** : nom, téléphone, intitulé, fuseau, changement de mot de passe (révoque les autres
  sessions).

## Modules « En développement »

Ces pages existent, sont protégées par les permissions, et **indiquent clairement qu'elles ne sont
pas utilisables** : elles n'affichent aucune liste, aucun chiffre, aucun bouton d'action factice.

| Module | Ce qui existe réellement | Ce qui reste à faire |
| --- | --- | --- |
| **Ressources humaines** | Tables `employees`, `employee_contracts`, `leave_requests`, `attendance_records` + RLS `hr:read` | Écrans employés/contrats/congés, validation des demandes, exports |
| **Finances** | Tables `invoices`, `invoice_items`, `payments`, `quotes`, `expenses`, `revenues`, `financial_categories` + RLS `finance:read` | Facturation, encaissements, dépenses, devis, lettrage. **Ce n'est pas une comptabilité certifiée** |
| **Partenaires** | Tables `partners`, `partner_contacts`, `partner_agreements` | Liste, fiches, conventions, échéances |
| **Communication** | Tables `announcements`, `calendar_events` | Annonces internes, calendrier partagé |
| **Assistant IA** | Rien n'appelle de service externe | Cadrage, permissions, fournisseur, coûts — sur autorisation explicite |

## Signaler un problème

Notez l'écran, l'heure, l'action et le message affiché. Les erreurs techniques sont volontairement
génériques à l'écran ; le détail est dans les journaux du serveur (`console` du processus Node).
