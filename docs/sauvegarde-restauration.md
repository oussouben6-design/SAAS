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
