import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { SqlExecutor } from "./client";
import { MIGRATIONS_PATH } from "./client";

/**
 * Exécuteur de migrations versionnées.
 * Chaque fichier `supabase/migrations/NNNN_*.sql` est appliqué une seule fois,
 * dans une transaction, puis enregistré dans `app.migrations`.
 */

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

async function ensureMigrationsTable(tx: SqlExecutor) {
  await tx.exec(`
    create schema if not exists app;
    create table if not exists app.migrations (
      name text primary key,
      applied_at timestamptz not null default now(),
      duration_ms integer not null default 0
    );
  `);
}

export async function runMigrations(tx: SqlExecutor, log: (message: string) => void = () => {}): Promise<MigrationResult> {
  await ensureMigrationsTable(tx);
  const files = (await readdir(MIGRATIONS_PATH))
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  const existing = await tx.query<{ name: string }>("select name from app.migrations");
  const appliedSet = new Set(existing.map((row) => row.name));
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    if (appliedSet.has(file)) {
      skipped.push(file);
      continue;
    }
    const sql = await readFile(path.join(MIGRATIONS_PATH, file), "utf8");
    const startedAt = Date.now();
    await tx.exec("begin");
    try {
      await tx.exec(sql);
      await tx.query("insert into app.migrations (name, duration_ms) values ($1, $2)", [
        file,
        Date.now() - startedAt,
      ]);
      await tx.exec("commit");
    } catch (error) {
      await tx.exec("rollback");
      log(`Échec de la migration ${file}`);
      throw error;
    }
    applied.push(file);
    log(`Migration appliquée : ${file} (${Date.now() - startedAt} ms)`);
  }

  return { applied, skipped };
}

export async function migrationStatus(tx: SqlExecutor) {
  await ensureMigrationsTable(tx);
  const files = (await readdir(MIGRATIONS_PATH)).filter((file) => file.endsWith(".sql")).sort();
  const rows = await tx.query<{ name: string; applied_at: string }>(
    "select name, applied_at from app.migrations",
  );
  const appliedNames = new Set(rows.map((row) => row.name));
  return files.map((file) => ({
    name: file,
    applied: appliedNames.has(file),
    appliedAt: rows.find((row) => row.name === file)?.applied_at ?? null,
  }));
}
