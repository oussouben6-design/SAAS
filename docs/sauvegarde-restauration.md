# Sauvegarde et restauration

> Une sauvegarde n'est utile que si la **restauration a été testée**. La procédure ci-dessous
> inclut un test sur une base de vérification.

## Ce qu'il faut sauvegarder

| Élément | Emplacement | Critique |
| --- | --- | --- |
| Base PostgreSQL | Supabase / serveur PostgreSQL | Oui (toutes les données métier) |
| Fichiers de documents | `ORGANIX_STORAGE_DIR` (défaut `.data/storage`) | Oui (contenu des documents) |
| Variables d'environnement | `.env.local` / coffre-fort de l'hébergeur | Oui (secrets, non versionnés) |
| Code source | Dépôt Git | Oui |

La base ne sauvegarde **pas** les fichiers, et inversement : les deux sont nécessaires.

## Scripts fournis (testés sur le développement PGlite)

```bash
npm run db:backup                       # copie à froid + manifeste + empreintes SHA-256
npm run db:backup -- --verifier         # + ouvre la copie dans une instance jetable et compte
npm run db:backup -- --out /mnt/sauvegardes/organix
npm run db:restore -- --depuis backups/organix-AAAA... --yes --force
```

- `db:backup` refuse de s'exécuter sur un répertoire vide ou absent ; il écrit
  `backups/organix-<horodatage>/` avec `manifest.json`, `database/` et `storage/`.
- `db:restore` contrôle **toutes** les empreintes avant d'écrire, refuse d'écraser une base
  existante sans `--force`, et conserve l'ancienne base sous `<cible>.avant-restauration-<date>`.
- En mode `postgres`, `db:backup` exige le binaire `pg_dump` (paquet `postgresql-client`) et produit
  un dump `--format=custom` ; `db:restore` refuse volontairement de toucher une base réseau (utilisez
  `pg_restore` dans une base de vérification).

**Résultat de la vérification exécutée le 3 novembre 2026 sur la base de démonstration locale :**

```
Base         : 1225 fichier(s), 43 991 164 octets (pglite-directory)
Stockage     : 3 fichier(s), 211 octets
Empreintes   : 1228 contrôlées, 0 anomalie
Vérification : 46 tables publiques, 1 organisation, 125 politiques RLS (46 tables en RLS forcée)
Restauration : 9/9 migrations, 6 profils, 5 clients, 3 factures, 5 employés après restauration
```

⚠️ La procédure reste **non testée sur une base PostgreSQL distante** (aucun serveur accessible ici).

## Sauvegarde — PostgreSQL managé (Supabase)

- **Supabase Pro** : sauvegardes quotidiennes automatiques + restauration à un instant (PITR,
  option payante). Vérifiez la rétention dans *Database → Backups*.
- **Plan gratuit** : pas de sauvegarde automatique exploitable. Exportez vous-même :

```bash
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges \
  --file="organix-$(date +%Y%m%d-%H%M).dump"
```

Conservez au moins 7 exports quotidiens + 4 hebdomadaires dans un stockage distinct (coffre ou
stockage objet chiffré). Vérifiez la taille et l'intégrité (`pg_restore --list fichier.dump`).

## Sauvegarde — PostgreSQL auto-hébergé

```bash
# tous les jours à 02:00 (crontab)
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges \
  --file="/var/backups/organix/organix-$(date +%Y%m%d).dump"
find /var/backups/organix -name '*.dump' -mtime +30 -delete
```

Plus le code esquissé ci-dessous pour les fichiers :

```bash
rsync -a --delete /var/lib/organix/storage/ /var/backups/organix/storage/
```

## Sauvegarde — fichiers

```bash
# archive datée, à copier hors du serveur
tar czf "organix-storage-$(date +%Y%m%d).tar.gz" -C "$ORGANIX_STORAGE_DIR" .
```

Chiffrez l'archive (elle contient des documents internes) : `age`, `gpg` ou le chiffrement de
votre stockage objet. Testez la restauration d'un fichier au hasard.

## Restauration

### Sur une base neuve (scénario sinistre)

```bash
createdb organix_restaure
pg_restore --dbname=postgresql://.../organix_restaure --no-owner --no-privileges fichier.dump
# vérifier la restauration
psql "$URL_RESTAURE" -c "select count(*) as organisations from organizations;"
psql "$URL_RESTAURE" -c "select count(*) as politiques_rls from pg_policies where schemaname = 'public';"
```

Puis appliquez les migrations manquantes (`npm run db:migrate`), restaurez les fichiers au même
chemin (`ORGANIX_STORAGE_DIR`), et repointez `DATABASE_URL` vers la base restaurée.

Les chemins stockés en base (`documents.storage_path`) sont relatifs au répertoire de stockage : si
vous restaurez dans un autre répertoire, adaptez `ORGANIX_STORAGE_DIR` plutôt que les lignes.

### Test de restauration recommandé (mensuel)

1. Créez une base de vérification (jamais la production).
2. Restaurez le dernier export.
3. Démarrez l'application avec `DATABASE_URL` pointant sur cette base, sur un port différent.
4. Vérifiez : connexion, tableau de bord, ouverture d'un document existant (fichier présent),
   journal d'audit.
5. Notez la durée et les écarts dans le registre d'exploitation.

### PGlite (développement)

Copie de répertoire à froid (application arrêtée) :

```bash
# sauvegarde
tar czf organix-dev-backup.tar.gz .data/pglite .data/storage
# restauration
tar xzf organix-dev-backup.tar.gz
```

Ne copiez jamais `.data/pglite` pendant que le serveur ou un script tourne (état incohérent).

## Rétention et sécurité

- Conservez les sauvegardes **hors du serveur** appliqué.
- Chiffrez-les et limitez les accès (secrets séparés du serveur).
- Testez la restauration au moins une fois par mois et après chaque montée de version majeure.
- Après restauration, vérifiez que la démonstration n'a pas été réintroduite
  (`npm run db:status` signale les organisations `is_demo`).
- Documentez chaque opération (date, fichier, taille, durée, opérateur) dans un registre.

## Récupération après corruption de la base embarquée

PGlite ne sait pas toujours se remettre d'un arrêt brutal (`kill -9`) ou d'une ouverture par deux
processus : au démarrage suivant, `PgliteDb.create` échoue avec `RuntimeError: Aborted()`. La
procédure est celle d'une restauration normale, sur la dernière sauvegarde valide :

1. Arrêter l'application (`Ctrl+C`, jamais `kill -9`).
2. `ls -1 backups/ | tail -3` puis `npm run db:backup -- --verifier` sur une copie si un doute existe.
3. `npm run db:restore -- --depuis backups/organix-AAAA... --yes --force` — l'ancienne base est
   conservée dans `.data/pglite.avant-restauration-<horodatage>`.
4. `npm run db:migrate` puis, pour une démonstration, `npm run db:seed -- --force`.
5. Contrôler avec `npm run db:status`, redémarrer, puis `curl /api/health` (doit renvoyer `ok`).
6. Supprimer le répertoire `avant-restauration` une fois la reprise vérifiée.

Prévention : le verrou `.organix-instance.lock` empêche deux processus simultanés, et l'arrêt
`SIGTERM` ferme proprement la base.
