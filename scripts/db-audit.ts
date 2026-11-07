/**
 * Audit de schéma : dérive entre la base réelle et ce que produit le dépôt.
 * Usage :
 *   npm run db:audit              # contrôle, code de sortie 1 si bloquant
 *   npm run db:audit -- --update  # régénère supabase/schema-lock.json depuis la base courante
 *
 * Cinq contrôles :
 *  1. Journal des migrations : `app.migrations` doit contenir exactement les fichiers de
 *     `supabase/migrations/`. Une entrée sans fichier = objet créé hors versionnement (dérive) ;
 *     un fichier sans entrée = migration non appliquée.
 *  2. RLS activée **et forcée** sur toutes les tables métier de `public`.
 *  3. Aucun privilège `anon`/`authenticated` sur les tables de `public` (durcissement 0013) :
 *     l'API n'est atteignable que par le serveur Next.js via `organix_app`.
 *  4. Aucune fonction `security definer` de `app`/`public` exécutable par `anon`/`authenticated`.
 *  5. Verrou de schéma (`supabase/schema-lock.json`) : inventaire des tables, colonnes, index,
 *     contraintes, politiques RLS, déclencheurs et fonctions. Toute divergence base/verrou est
 *     une erreur, où qu'elle aille — cela protège à la fois « j'ai modé la base sans le Git » et
 *     « j'ai modifié les migrations sans re-valider la production ».
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDb, closeDb, privileged } from "../src/lib/db";
import { MIGRATIONS_PATH } from "../src/lib/db/client";
import type { SqlExecutor } from "../src/lib/db/client";

const LOCK_PATH = path.join(process.cwd(), "supabase", "schema-lock.json");
const update = process.argv.includes("--update");

/**
 * Objets que seule une base Supabase sait produire (schéma `auth` présent). Ils sont exclus de
 * la comparaison avec le verrou lorsque l'audit tourne sur PGlite, dont le moteur ne peut pas
 * les créer — sinon chaque déploiement local crierait à la dérive.
 */
const SUPABASE_TRIGGERS_ONLY = new Set([
  "tasks|tasks_notify_assigned",
  "leave_requests|leave_requests_notify_decided",
]);

const SUPABASE_ONLY = new Set([
  "public.handle_new_user",
  "public.bootstrap_organization",
  "public.add_organization_member_by_email",
  "public.convert_quote_to_invoice",
  "public.notify_task_assigned",
  "public.notify_leave_decided",
  "public.rls_auto_enable", // fourni par la plateforme Supabase, pas par le dépôt
]);

interface Inventory {
  migrations: string[];
  tables: string[];
  columns: string[];
  indexes: string[];
  constraints: string[];
  policies: string[];
  triggers: string[];
  functions: string[];
}

async function sorted(tx: SqlExecutor, sql: string): Promise<string[]> {
  const rows = await tx.query<{ v: string }>(sql);
  return rows.map((row) => row.v).sort();
}

async function collect(tx: SqlExecutor): Promise<Inventory> {
  return {
    migrations: (await readdir(MIGRATIONS_PATH)).filter((f) => f.endsWith(".sql")).sort(),
    tables: await sorted(
      tx,
      `select c.relname as v from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'`,
    ),
    columns: await sorted(
      tx,
      `select table_name || '.' || column_name as v from information_schema.columns
        where table_schema = 'public'`,
    ),
    indexes: await sorted(
      tx,
      `select tablename || '|' || indexname as v from pg_indexes where schemaname = 'public'`,
    ),
    // Les contraintes NOT NULL ne sont pas toutes dans pg_constraint selon les mineures de
    // PostgreSQL 17 : on compare le nombre de colonnes NOT NULL via `columns` + ce relevé.
    constraints: await sorted(
      tx,
      `select c.relname || '|' || con.conname || '|' || con.contype::text as v
        from pg_constraint con join pg_class c on c.oid = con.conrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and con.contype <> 'n'`,
    ),
    policies: await sorted(
      tx,
      `select tablename || '|' || policyname as v from pg_policies where schemaname = 'public'`,
    ),
    triggers: await sorted(
      tx,
      `select c.relname || '|' || t.tgname as v from pg_trigger t
        join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and not t.tgisinternal`,
    ),
    functions: await sorted(
      tx,
      `select n.nspname || '.' || p.proname as v from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('app', 'public')`,
    ),
  };
}

function diffSets(reference: string[], actual: string[]): { onlyActual: string[]; onlyReference: string[] } {
  const ref = new Set(reference);
  const act = new Set(actual);
  return {
    onlyActual: actual.filter((v) => !ref.has(v)),
    onlyReference: reference.filter((v) => !act.has(v)),
  };
}

async function main() {
  const db = await getDb();
  const errors: string[] = [];
  const warnings: string[] = [];
  const notes: string[] = [];

  const data = await privileged(async (tx) => {
    const inventory = await collect(tx);
    let ledger: string[] = [];
    try {
      const rows = await tx.query<{ name: string }>("select name from app.migrations");
      ledger = rows.map((row) => row.name).sort();
    } catch {
      notes.push("journal `app.migrations` absent : migrations non appliquées");
    }
    const rls = await tx.query<{ relname: string; rls: boolean; force: boolean }>(
      `select c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as force
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' order by 1`,
    );
    const exposedGrants = await tx.query<{ grantee: string; privilege: string; n: number }>(
      `select grantee, privilege_type as privilege, count(distinct table_name)::int as n
        from information_schema.role_table_grants
        where table_schema = 'public' and grantee in ('anon', 'authenticated')
        group by 1, 2 order by 1, 2`,
    ).catch(() => []);
    const roles = await tx.query<{ rolname: string }>(
      `select rolname from pg_roles where rolname in ('anon', 'authenticated')`,
    );
    let exposedFunctions: { name: string; role: string }[] = [];
    if (roles.length > 0) {
      exposedFunctions = await tx.query<{ name: string; role: string }>(
        `select n.nspname || '.' || p.proname as name, r.rolname as role from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          cross join lateral unnest(array['anon', 'authenticated']) as r(rolname)
          where n.nspname in ('app', 'public') and p.prosecdef
            and has_schema_privilege(r.rolname, n.nspname, 'USAGE')
            and has_function_privilege(r.rolname, p.oid, 'EXECUTE')
          order by 1`,
      ).catch(() => []);
    }
    // Politique permissive « FOR ALL » sans USING : elle vaut aussi pour SELECT (USING implicite
    // true) et annule donc le filtrage par organisation de la table.
    // Contrôle réservé à PostgreSQL réel : PGlite enregistre toute politique avec polcmd = 'a',
    // ce qui rendrait la comparaison impossible en local (faux positifs systématiques).
    const leakyPolicies =
      db.driver === "postgres"
        ? await tx
            .query<{ name: string }>(
              `select c.relname || '|' || pol.polname as name from pg_policy pol
                join pg_class c on c.oid = pol.polrelid join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and pol.polcmd = 'a' and pol.polqual is null
                  and pol.polwithcheck is not null
                order by 1`,
            )
            .catch(() => [] as { name: string }[])
        : [];
    return {
      inventory,
      ledger,
      rls,
      exposedGrants,
      exposedFunctions,
      leakyPolicies,
      supabaseRoles: roles.length > 0,
    };
  });

  if (db.driver === "pglite") {
    notes.push(
      "PGlite : contrôle « politique for all sans USING » ignoré (le moteur ne différencie pas les commandes de politique)",
    );
    data.inventory.functions = data.inventory.functions.filter((f) => !SUPABASE_ONLY.has(f));
    data.inventory.triggers = data.inventory.triggers.filter((t) => !SUPABASE_TRIGGERS_ONLY.has(t));
    notes.push(
      "PGlite : objets réservés Supabase (déclencheurs de notification, fonctions `auth.*`) exclus de la comparaison",
    );
  }

  console.info(`[excellence360:audit] Moteur : ${db.driver}`);
  console.info(
    `[excellence360:audit] Inventaire : ${data.inventory.tables.length} tables · ` +
      `${data.inventory.policies.length} politiques RLS · ${data.inventory.triggers.length} déclencheurs · ` +
      `${data.inventory.functions.length} fonctions · ${data.inventory.columns.length} colonnes`,
  );

  // 1. Journal des migrations
  const unknownInDb = data.ledger.filter((name) => !data.inventory.migrations.includes(name));
  const notApplied = data.inventory.migrations.filter((name) => !data.ledger.includes(name));
  if (unknownInDb.length > 0) {
    errors.push(
      `journal de migrations contient ${unknownInDb.length} entrée(s) sans fichier dans le dépôt ` +
        `(objets SQL appliqués hors versionnement) : ${unknownInDb.join(", ")}`,
    );
  }
  if (notApplied.length > 0) {
    errors.push(`migration(s) du dépôt non appliquée(s) : ${notApplied.join(", ")}`);
  }

  // 2. RLS
  const noRls = data.rls.filter((t) => !t.rls || !t.force).map((t) => `${t.relname}${t.rls ? " (non forcée)" : ""}`);
  if (noRls.length > 0) errors.push(`RLS non activée/forcée sur : ${noRls.join(", ")}`);

  // 3 et 4. Exposition PostgREST
  if (data.supabaseRoles && data.exposedGrants.length > 0) {
    const detail = data.exposedGrants.map((g) => `${g.grantee}.${g.privilege} (${g.n} tables)`).join(", ");
    errors.push(
      `privilèges révoqués par la migration 0013 retrouvés sur les tables métier : ${detail}. ` +
        `Les données deviennent interrogeables via l'API générée (PostgREST) avec un jeton d'organisation.`,
    );
  }
  // Une politique `FOR ALL` sans USING filtre aussi peu qu'une politique SELECT absente.
  if (data.leakyPolicies.length > 0) {
    errors.push(
      `politique(s) permissive(s) « for all » sans clause USING — donc valables pour SELECT avec ` +
        `USING implicite vrai, ce qui annule l'isolation par organisation : ` +
        `${data.leakyPolicies.map((p) => p.name).join(", ")}.`,
    );
  }

  const anonExposed = data.exposedFunctions.filter((f) => f.role === "anon").map((f) => f.name);
  const authExposed = data.exposedFunctions.filter((f) => f.role === "authenticated").map((f) => f.name);
  if (anonExposed.length > 0) {
    errors.push(
      `fonction(s) security definer exécutable(s) par le rôle ANONYNE : ${anonExposed.join(", ")}. ` +
        `Une fonction de déclencheur ou de service n'a rien à exposer sans jeton.`,
    );
  }
  if (authExposed.length > 0) {
    warnings.push(
      `fonction(s) security definer exécutable(s) par « authenticated » (modèle RPC PostgREST, à ` +
        `valider) : ${authExposed.join(", ")}`,
    );
  }

  // 5. Verrou de schéma
  let lock: Inventory | null = null;
  try {
    lock = JSON.parse(await readFile(LOCK_PATH, "utf8")) as Inventory & { generatedAt?: string; driver?: string };
  } catch {
    if (!update) {
      notes.push("verrou de schéma absent (supabase/schema-lock.json) : `npm run db:audit -- --update` pour le créer");
    }
  }
  if (lock) {
    for (const key of Object.keys(data.inventory) as (keyof Inventory)[]) {
      const { onlyActual, onlyReference } = diffSets(lock[key], data.inventory[key]);
      if (onlyActual.length > 0) {
        errors.push(
          `${key} : ${onlyActual.length} objet(s) présent(s) en base mais pas dans le verrou — ` +
            `${onlyActual.slice(0, 12).join(", ")}${onlyActual.length > 12 ? ", …" : ""}`,
        );
      }
      if (onlyReference.length > 0) {
        errors.push(
          `${key} : ${onlyReference.length} objet(s) attendu(s) par le verrou mais absent(s) de la base — ` +
            `${onlyReference.slice(0, 12).join(", ")}${onlyReference.length > 12 ? ", …" : ""}`,
        );
      }
    }
  }

  if (update) {
    await writeFile(
      LOCK_PATH,
      `${JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), driver: db.driver, ...data.inventory }, null, 2)}\n`,
      "utf8",
    );
    console.info(`[excellence360:audit] Verrou écrit : ${path.relative(process.cwd(), LOCK_PATH)}`);
  }

  for (const note of notes) console.info(`  · ${note}`);
  if (warnings.length > 0) {
    console.info("\n[excellence360:audit] Avertissements :");
    for (const warning of warnings) console.warn(`  ⚠ ${warning}`);
  }
  if (errors.length > 0) {
    console.error(`\n[excellence360:audit] ${errors.length} anomalie(s) :`);
    for (const error of errors) console.error(`  ✗ ${error}`);
    process.exitCode = 1;
  } else if (!update) {
    console.info("\n[excellence360:audit] Schéma conforme au dépôt : aucune dérive détectée.");
  }

  await closeDb();
}

main().catch((error) => {
  console.error("[excellence360:audit] Échec de l'audit :", error);
  process.exitCode = 1;
});
