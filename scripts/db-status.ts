/**
 * Affiche l'état de la base configurée : moteur, migrations, volumétrie, démonstration.
 * Usage : npm run db:status
 */
import { getDb, closeDb, privileged } from "../src/lib/db";
import { migrationStatus } from "../src/lib/db/migrate";

const TABLES = [
  "organizations",
  "profiles",
  "organization_members",
  "roles",
  "permissions",
  "customers",
  "leads",
  "opportunities",
  "projects",
  "tasks",
  "documents",
  "employees",
  "invoices",
  "expenses",
  "partners",
  "audit_logs",
];

async function main() {
  const db = await getDb();
  console.info(`[organix] Moteur de base    : ${db.driver}`);
  if (db.driver === "pglite") {
    console.info(
      `[organix] Répertoire local  : ${process.env.ORGANIX_DATA_DIR ?? ".data/pglite"}`,
    );
  }
  console.info(`[organix] Auto-migration    : ${process.env.AUTO_MIGRATE === "true" ? "oui" : "non"}`);

  const { migrations, tables, demo } = await privileged(async (tx) => {
    const status = await migrationStatus(tx);
    const counts: Record<string, number> = {};
    for (const table of TABLES) {
      try {
        const rows = await tx.query<{ count: number }>(
          `select count(*)::int as count from ${table}`,
        );
        counts[table] = rows[0]!.count;
      } catch {
        counts[table] = Number.NaN;
      }
    }
    const demos = await tx.query<{ name: string; slug: string }>(
      "select name, slug from organizations where is_demo = true order by created_at",
    ).catch(() => []);
    return { migrations: status, tables: counts, demo: demos };
  });

  const preflight = await privileged(async (tx) => {
    const [version] = await tx.query<{ version: string; num: number }>(
      "select version() as version, current_setting('server_version_num')::int as num",
    );
    const canSetRole = await tx
      .query<{ ok: boolean }>("select app.can_set_app_role() as ok")
      .then((rows) => rows[0]?.ok ?? null)
      .catch(() => null);
    const [rls] = await tx.query<{ total: number; forced: number }>(
      `select count(*)::int as total,
              count(*) filter (where c.relforcerowsecurity)::int as forced
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where c.relkind = 'r' and c.relrowsecurity
          and n.nspname not in ('pg_catalog', 'information_schema', 'storage', 'auth', 'realtime')`,
    );
    const [role] = await tx.query<{ role: string; bypass: boolean }>(
      "select current_user as role, (select rolbypassrls from pg_roles where rolname = current_user) as bypass",
    );
    return { version, canSetRole, rls, role };
  });

  console.info(`\nServeur : ${preflight.version?.version?.split(" on ")[0] ?? "inconnu"}`);
  console.info(
    `Rôle de connexion : ${preflight.role?.role ?? "?"} (contourne la RLS : ${preflight.role?.bypass ? "oui" : "non"})`,
  );
  console.info(
    `RLS forcée : ${preflight.rls?.forced ?? 0}/${preflight.rls?.total ?? 0} tables protégées` +
      (preflight.rls && preflight.rls.forced !== preflight.rls.total ? "  ⚠ des tables ne sont pas forcées" : ""),
  );
  if (preflight.canSetRole === null) {
    console.info("Bascule de rôle applicatif : fonction app.can_set_app_role() absente (migration 0012 non appliquée)");
  } else if (preflight.canSetRole) {
    console.info("Bascule de rôle applicatif : OK (set local role organix_app autorisé)");
  } else {
    console.info(
      "Bascule de rôle applicatif : ✗ refusée — exécutez `npm run db:migrate` avec le rôle propriétaire " +
        "(sur Supabase : user postgres), sinon les requêtes métier échouent en 42501.",
    );
  }

  const applied = migrations.filter((item) => item.applied).length;
  console.info(`\nMigrations : ${applied}/${migrations.length} appliquées`);
  for (const item of migrations) {
    console.info(`  ${item.applied ? "✓" : "·"} ${item.name}${item.applied ? ` (${item.appliedAt})` : " — en attente"}`);
  }

  console.info("\nVolumétrie :");
  for (const [table, count] of Object.entries(tables)) {
    console.info(`  ${table.padEnd(22)} ${Number.isNaN(count) ? "table absente" : count}`);
  }

  console.info("\nOrganisations de démonstration :");
  if (demo.length === 0) {
    console.info("  aucune (aucune donnée fictive en base)");
  } else {
    for (const organization of demo) {
      console.info(`  ⚠ ${organization.name} (${organization.slug}) — is_demo = true`);
    }
  }

  await closeDb();
}

main().catch(async (error) => {
  console.error("[organix] Lecture de l'état impossible :", error);
  process.exitCode = 1;
  await closeDb().catch(() => {});
});
