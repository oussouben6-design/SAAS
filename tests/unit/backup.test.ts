import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { runMigrations } from "@/lib/db/migrate";
import type { SqlExecutor } from "@/lib/db";
import {
  createBackup,
  readManifest,
  restoreBackup,
  verifyBackup,
  verifyChecksums,
} from "@/lib/backup";

const envKeys = ["DATABASE_MODE", "DATABASE_URL", "ORGANIX_DATA_DIR", "ORGANIX_STORAGE_DIR"] as const;
const originalEnv: Record<string, string | undefined> = {};
for (const key of envKeys) originalEnv[key] = process.env[key];

let workspace: string;

async function seededDatabase(dir: string, organizationName: string) {
  const db = await PGlite.create({ dataDir: dir });
  const executor: SqlExecutor = {
    query: async <T>(text: string, params?: unknown[]) =>
      (await db.query<T>(text, params)).rows,
    exec: async (sql: string) => {
      await db.exec(sql);
    },
  };
  await runMigrations(executor);
  await executor.query(
    `insert into organizations (name, slug, currency, timezone, language)
     values ($1, $2, 'XOF', 'Africa/Niamey', 'fr')`,
    [organizationName, `${organizationName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-test`],
  );
  await db.close();
}

async function countOrganizations(dir: string): Promise<number> {
  const db = await PGlite.create({ dataDir: dir });
  try {
    const result = await db.query<{ count: number }>("select count(*)::int as count from organizations");
    return result.rows[0]?.count ?? 0;
  } finally {
    await db.close();
  }
}

beforeEach(async () => {
  workspace = await mkdtemp(path.join(os.tmpdir(), "organix-backup-"));
  process.env.DATABASE_MODE = "pglite";
  delete process.env.DATABASE_URL;
  process.env.ORGANIX_DATA_DIR = path.join(workspace, "source");
  process.env.ORGANIX_STORAGE_DIR = path.join(workspace, "storage");
});

afterEach(async () => {
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  await rm(workspace, { recursive: true, force: true });
});

describe("sauvegarde et restauration", () => {
  it("sauvegarde une base PGlite, vérifie ses empreintes et la restaure", async () => {
    await seededDatabase(path.join(workspace, "source"), "Organisation Sauvegarde");
    const { mkdir, writeFile: write } = await import("node:fs/promises");
    await mkdir(path.join(workspace, "storage", "org", "doc"), { recursive: true });
    await write(path.join(workspace, "storage", "org", "doc", "note.txt"), "document de test");

    const backupDir = path.join(workspace, "backup");
    const manifest = await createBackup({ outDir: backupDir });
    expect(manifest.format).toBe("organix-backup/v1");
    expect(manifest.driver).toBe("pglite");
    expect(manifest.database.files).toBeGreaterThan(0);
    expect(manifest.storage?.included).toBe(true);
    expect(manifest.storage?.files).toBe(1);
    expect(Object.keys(manifest.checksums).length).toBeGreaterThan(0);

    const stored = await readManifest(backupDir);
    expect(stored.createdAt).toBe(manifest.createdAt);

    const checksums = await verifyChecksums(backupDir);
    expect(checksums.mismatched).toEqual([]);

    const verified = await verifyBackup(backupDir);
    expect(verified.publicTables).toBeGreaterThan(20);
    expect(verified.organizations).toBe(1);
    expect(verified.policies).toBeGreaterThan(50);
    expect(verified.forcedRlsTables).toBeGreaterThan(20);

    const restoredDir = path.join(workspace, "restored");
    const result = await restoreBackup({ from: backupDir, target: restoredDir });
    expect(result.target).toBe(restoredDir);
    expect(await countOrganizations(restoredDir)).toBe(1);
    const restoredNote = await readFile(path.join(workspace, "storage", "org", "doc", "note.txt"), "utf8");
    expect(restoredNote).toBe("document de test");
  }, 120_000);

  it("détecte une sauvegarde corrompue et refuse de restaurer", async () => {
    await seededDatabase(path.join(workspace, "source"), "Organisation Corrompue");
    const backupDir = path.join(workspace, "backup");
    const manifest = await createBackup({ outDir: backupDir, includeStorage: false });
    const firstEntry = Object.keys(manifest.checksums).find((entry) => entry.startsWith("database/"))!;
    await writeFile(path.join(backupDir, firstEntry), "corrompu", "utf8");

    const checksums = await verifyChecksums(backupDir);
    expect(checksums.mismatched.length).toBeGreaterThan(0);
    await expect(restoreBackup({ from: backupDir, target: path.join(workspace, "restored") })).rejects.toThrow(
      /corrompue/i,
    );
  }, 120_000);

  it("refuse d'écraser une base existante sans --force et conserve une copie de sécurité", async () => {
    await seededDatabase(path.join(workspace, "source"), "Organisation Source");
    const backupDir = path.join(workspace, "backup");
    await createBackup({ outDir: backupDir, includeStorage: false });

    const target = path.join(workspace, "existing");
    await seededDatabase(target, "Organisation Existante");

    await expect(restoreBackup({ from: backupDir, target })).rejects.toThrow(/n'est pas vide/i);

    const forced = await restoreBackup({ from: backupDir, target, force: true });
    expect(forced.safetyCopy).toContain("avant-restauration");
    expect(await countOrganizations(target)).toBe(1);
  }, 120_000);

  it("échoue clairement quand le répertoire de base est absent", async () => {
    await expect(createBackup({ outDir: path.join(workspace, "backup") })).rejects.toThrow(/introuvable/i);
  });

  it("refuse la vérification et la restauration automatiques d'un dump PostgreSQL réseau", async () => {
    await seededDatabase(path.join(workspace, "source"), "Organisation PG");
    const backupDir = path.join(workspace, "backup");
    const manifest = await createBackup({ outDir: backupDir, includeStorage: false });
    await writeFile(
      path.join(backupDir, "manifest.json"),
      JSON.stringify({ ...manifest, driver: "postgres", database: { kind: "pg_dump-custom", files: 1, bytes: 10 } }),
      "utf8",
    );
    await expect(verifyBackup(backupDir)).rejects.toThrow(/PGlite/i);
    await expect(restoreBackup({ from: backupDir, target: path.join(workspace, "pg") })).rejects.toThrow(
      /pg_restore/i,
    );
  }, 120_000);
});
