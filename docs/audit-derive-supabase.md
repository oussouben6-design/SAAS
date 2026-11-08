# Audit de dérive — projet Supabase `opnlvqwbevnivfjpbrxa` (7 novembre 2026)

Cet audit documenta un écart entre **la base réelle** et **le dépôt**, puis les corrections qui en
découlent. Une première lecture de ce document affirmait une « fuite inter-organisations » :
**elle était fausse** (méprise sur `pg_policy.polcmd`, voir § 3.1). Tout ce qui suit est vérifié par
requêtes, et les conclusions négatives comme positives sont datées.

## 1. Méthode

1. Base de référence : PGlite neuve sur laquelle **seules** les migrations du dépôt sont appliquées.
2. Comparaison avec la base réelle, objet par objet, plus empreintes (count + md5) sur sept
   familles : tables, colonnes, index, contraintes, politiques RLS, déclencheurs, fonctions.
3. Lecture des définitions réelles (`pg_get_expr`, `pg_get_triggerdef`, `prosrc`, ACL) pour
   reconstruire ce qui manquait au dépôt.
4. Aucun accès au mot de passe de la base : tout est passé par l'API de gestion Supabase.

## 2. Inventaire comparé

| Famille | Dépôt (14 migrations) | Base réelle (19 au journal) | Verdict |
| --- | --- | --- | --- |
| Tables (`public`) | 49 | 49 | identique |
| Colonnes | 557 | 557 | identique |
| Index | 120 | 120 | identique |
| Contraintes (hors NOT NULL) | 299 | 299 | identique |
| Colonnes NOT NULL | 343 | 343 | identique |
| Politiques RLS | 128 | **133** | 7 en trop, 2 supprimées |
| Déclencheurs | 26 | **33** | 7 en trop |
| Fonctions (`app` + `public`) | 8 | **20** | 12 en trop |
| Journal `app.migrations` | 14 fichiers | **19 entrées** | 5 entrées sans fichier |
| Privilèges `authenticated` sur les tables | **0** (0013) | **172** (43 tables × 4) | révocations annulées |
| `organix_app` sans privilège de table | — | 3 tables | `user_mfa`, `mfa_challenges`, `user_identities` |

Aucune dérive **structurelle** : l'écart porte sur du comportement (politiques, déclencheurs,
fonctions) et sur les **privilèges**.

## 3. Ce que la dérive changeait réellement

### 3.1 L'erreur d'analyse à ne pas répéter

`pg_policy.polcmd` ne vaut **pas** `'a'` pour « ALL ». Les valeurs sont :

| `polcmd` | Commande |
| --- | --- |
| `r` | SELECT |
| `a` | INSERT |
| `w` | UPDATE |
| `d` | DELETE |
| `*` | ALL |

Une politique `FOR INSERT` sans `USING` est **normale** (`WITH CHECK` suffit) ; seules `'*'` et
`'r'` sans `USING` ouvrent les lectures. En comparant à `polcmd = 'a'`, la première version de ce
document a conclu — à tort — que les 26 politiques `*_insert` du dépôt exposaient toutes les
lignes, et que `0019` ajoutait cette exposition. État réellement mesuré en base après récupération :

```
'*' : 15 politiques, 0 sans USING     'r' : 46 politiques, 0 sans USING
'a' : 26 politiques, 26 sans USING  ← correct : ce sont des politiques d'insertion
```

Le dépôt n'a donc **jamais** contenu de politique lisible sans restriction. La garde
`npm run db:audit` compare maintenant `polcmd in ('*','r') and polqual is null`, et PGlite est
traité comme PostgreSQL réel (sa catalog est conforme ; la note « moteur incapable de distinguer »
que portait le script était fausse, elle a été supprimée).

### 3.2 Les cinq migrations jamais versionnées

Appliquées le 7 novembre 2026 entre 20:36 et 21:17 UTC, présentes dans `app.migrations`, absentes
de `main` **et de toutes les branches** du dépôt :

| Entrée de journal | Contenu réel |
| --- | --- |
| `0015_supabase_auth_bridge.sql` | `public.handle_new_user()` + déclencheur `on_auth_user_created` sur `auth.users` ; `public.bootstrap_organization(...)` (onboarding en RPC) |
| `0016_member_by_email.sql` | `public.add_organization_member_by_email(...)` (ajout de membre par e-mail, permission, audit, notification) |
| `0017_finance_items_realtime_notifications.sql` | recalcul des totaux en base (`invoice_before_set_totals`, `quote_before_set_totals`, `invoice_items_recalc_totals`, `quote_items_recalc_totals`, `payments_recalc_paid`) + 5 déclencheurs ; `notify_task_assigned`, `notify_leave_decided` + leurs déclencheurs ; `notifications` ajoutée à la publication `supabase_realtime` |
| `0018_quote_to_invoice.sql` | `public.convert_quote_to_invoice(...)` (numérotation, recopie des lignes, devis → `accepted`, audit) |
| `0019_item_policies_fines.sql` | `invoice_items_write`/`quote_items_write` (`FOR ALL` avec `USING`) remplacées par 6 politiques par commande, **plus** `payments_update` : c'est un **resserrement**, pas une ouverture. Le volet « fines » n'existe en base sous aucune forme : abandonné avant commit |

Conséquence opérationnelle : un déploiement depuis `main` ne reproduisait **pas** la production.
Les objets ont été reconstruits à l'identique en `0015`→`0019` (leurs ACL aussi, au détail près de
`handle_new_user`, dont l'exécution est révoquée — un déclencheur n'a rien à exposer en HTTP).

### 3.3 Les deux vrais défauts

1. **Modèle d'accès cassé, pas une exposition.** Ces cinq migrations parient sur PostgREST
   (`auth.uid()` dans leurs corps, ACL `authenticated`, publication temps réel) alors que
   `app.current_user_id()` ne lisait que la variable de session `organix.user_id`, posée par
   `withSession()` du serveur. Résultat mesuré : pour toute voie HTTP, `current_user_id()` vaut
   `null`, donc `app.has_permission(...)` est faux et les politiques `*_select` filtrent à zéro
   ligne. Les RPC appelables par `authenticated` — y compris les trois ajoutées par
   `0016`/`0018` — **rejetaient systématiquement** leurs appelants, et Realtime ne délivrait rien.
   C'est le défaut que corrige `0022`, et la raison pour laquelle le dépôt doit **choisir** son
   modèle (§ 5).
2. **Durcissement `0013` annulé.** `authenticated` avait `SELECT/INSERT/UPDATE/DELETE` sur 43 des
   49 tables métier ; `anon` pouvait exécuter `public.handle_new_user()` et
   `public`-exécutable `rls_auto_enable()` ; `EXECUTE` sur les fonctions `app.*`. Ce n'était pas
   exploitable pour lire des données (politiques verrouillées à `null` — cf. 3.3.1), mais c'était
   une surface ouverte sans raison, et elle le deviendrait dès que le contexte aurait su lire un
   jeton. `0020` referme tout, `0023` ne rouvre **qu'**une politique de lecture RLS sur
   `notifications`, strictement nécessaire aux abonnements temps réel.

Les trois tables sans privilège pour `organix_app` (`user_mfa`, `mfa_challenges`, `user_identities`)
sont un **choix** et non un accident : elles ne sont lues que par le service d'authentification, en
mode privilégié. `0020` ajoute des privilèges par défaut pour `organix_app` afin qu'une table créée
par une migration future ne rejoigne pas cette liste silencieusement.

## 4. Corrections apportées au dépôt

| Migration | Effet |
| --- | --- |
| `0015`→`0019` | Récupération à l'identique des objets non versionnés (fonctions, déclencheurs, ACL, publication temps réel) |
| `0020_rls_insert_leak_fix` | Révoque `EXECUTE` de `handle_new_user` (public) et `rls_auto_enable` (anon/authenticated) ; rejoue les révocations de `0013` ; privilèges par défaut pour `organix_app`. *(Son volet « politiques d'insertion » corrigeait en fait une re-transcription inexacte de `0019` — l'état de la base était déjà le bon — et n'a donc rien changé : c'est ce qu'une exécution idempotente a confirmé.)* |
| `0021_rls_insert_policies_are_insert_only` | Boucle générique de reconstruction des politiques `for all` sans `USING`. **Aucune politique du dépôt n'est dans ce cas** : elle est un garde-fou idempotent (0 objet reconstruit en base réelle, 0 en PGlite), pas une correction |
| `0022_rls_context_accepts_supabase_jwt` | `app.current_user_id()` : variable de session **prioritaire**, repli sur `auth.uid()` si le schéma `auth` existe. C'est ce qui rend les RPC et Realtime utilisables — et ce qui rend les politiques réellement appliquées sur la voie HTTP |
| `0023_rpc_surface` | `SELECT` sur `notifications` pour `authenticated` (temps réel, sous RLS) ; révocation nominale de `handle_new_user` et `rls_auto_enable` pour `anon`/`authenticated` ; les RPC métier gardent `authenticated` + `service_role` |
| `scripts/db-audit.ts`, `supabase/schema-lock.json`, CI | Garde automatique : journal de migrations vs fichiers, RLS activée **et forcée**, privilèges `anon`/`authenticated` (liste d'exclusion explicite et justifiée), fonctions `security definer` exposées à `anon` (avertissement pour `authenticated`), politique `'*'`/`'r'` sans `USING`, inventaires comparés au verrou |

## 5. Décision de modèle (tranchée le 7 novembre 2026)

Choix retenu : **modèle RPC assumé**. Cela implique, et `0022`/`0023` le font :

- les politiques doivent savoir qui appelle → contexte lu dans le jeton ;
- le dépôt doit cesser de considérer `public` comme invisible et assumer la surface ouverte, en la
  contrôlant : seule `notifications` reste lisible par `authenticated`, tout le reste demeure révoqué ;
- les politiques de ces tables doivent rester correctes sous les deux voies, ce que vérifie
  `tests/integration/jwt-rls-context.test.ts`.

Alternative écartée, à réévaluer si l'on veut revenir à « Next.js seul » : révoquer `EXECUTE` aux
rôles Supabase sur les trois RPC, et supprimer `notifications` de la publication.

## 6. État de la base réelle

| Action | Date | Vérification |
| --- | --- | --- |
| `0013` annulée + 5 migrations hors Git | constat 7 nov. 20:36→21:17 | inventaire § 2 |
| `0020`, `0021` appliquées en base ; journal porté à 21 | 7 nov. 22:41 UTC | 133 politiques ; 0 politique `'*'`/`'r'` sans `USING` ; **0 privilège `anon`/`authenticated` sur les tables de `public`** |
| `0022`, `0023` appliquées | 7 nov. 22:52 UTC | `md5(pg_get_functiondef('app.current_user_id')) = a83e284a67f9548c274f891c80fe4d37`, **identique** à la base de référence PGlite ; 0 privilège `anon` ; 1 seul privilège `authenticated` (SELECT sur `notifications`) ; RLS forcée sur 49/49 ; journal à 23 entrées |

## 7. Ce que l'audit a produit de vérifiable

```
PGlite neuve, 23 migrations                 → 49 tables · 133 politiques · 31 déclencheurs · 13 fonctions · 557 colonnes
npm run db:audit (après --update du verrou) → « Schéma conforme au dépôt : aucune dérive détectée. »
npm test                                    → 141/141 tests en 20 fichiers (dont 6 sur le
#                                             contexte JWT et 5 sur les remèdes du
#                                             contrôle de configuration)
npx tsc --noEmit · npx eslint .             → 0 erreur
Simulation de dérive (5 entrées de journal, 5 politiques, 1 fonction en plus)
                                            → 4 anomalies signalées, code de sortie 1
```
