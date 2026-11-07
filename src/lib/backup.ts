import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

/**
 * Sauvegarde et restauration.
 *
 * - Mode `pglite` : copie à froid du répertoire de données (aucun binaire externe requis),
 *   avec empreintes SHA-256 et manifeste. La restauration peut être vérifiée en ouvrant la
 *   copie dans une instance PGlite jetable.
 * - Mode `postgres` : `pg_dump --format=custom` (binaire `pg_dump` requis) et `pg_restore`.
 *
 * Aucune opération n'est annoncée comme réussie sans contrôle : la création échoue si la copie
 * est vide, la restauration vérifie le manifeste et la vérification ouvre réellement la copie.
 */

export type BackupDriver = "pglite" | "postgres";

export interface BackupFileEntry {
  path: string;
  bytes: number;
  sha256: string;
}

export interface BackupManifest {
  format: "organix-backup/v1";
  createdAt: string;
  driver: BackupDriver;
  database: {
    kind: "pglite-directory" | "pg_dump-custom";
    files: number;
    bytes: number;
  };
  storage: { included: boolean; files: number; bytes: number } | null;
  checksums: Record<string, string>;
  appVersion: string;
}

export function resolveDriver(): BackupDriver {
  const explicit = process.env.DATABASE_MODE?.toLowerCase();
  if (explicit === "postgres" || explicit === "pglite") return explicit;
  return process.env.DATABASE_URL ? "postgres" : "pglite";
}

export function resolveDataDir(): string {
  return process.env.ORGANIX_DATA_DIR
    ? path.resolve(process.cwd(), process.env.ORGANIX_DATA_DIR)
    : path.join(process.cwd(), ".data", "pglite");
}

export function resolveStorageDir(): string {
  return process.env.ORGANIX_STORAGE_DIR
    ? path.resolve(process.cwd(), process.env.ORGANIX_STORAGE_DIR)
    : path.join(process.cwd(), ".data", "storage");
}

export function defaultBackupDir(now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  return path.join(process.cwd(), "backups", `excellence360-${stamp}`);
}

async function readAppVersion(): Promise<string> {
  try {
    const raw = await readFile(path.join(process.cwd(), "package.json"), "utf8");
    return (JSON.parse(raw) as { version?: string }).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

async function walk(root: string): Promise<string[]> {
  const result: string[] = [];
  async function visit(current: string, prefix: string) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute, relative);
      } else if (entry.isFile()) {
        result.push(relative);
      }
    }
  }
  await visit(root, "");
  return result.sort();
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function isNonEmptyDir(target: string): Promise<boolean> {
  try {
    const entries = await readdir(target);
    return entries.length > 0;
  } catch {
    return false;
  }
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

async function checksumTree(root: string, files: string[]): Promise<Record<string, string>> {
  const checksums: Record<string, string> = {};
  for (const file of files) {
    checksums[file] = sha256(await readFile(path.join(root, file)));
  }
  return checksums;
}

async function treeSize(root: string, files: string[]): Promise<{ bytes: number; files: number }> {
  let bytes = 0;
  for (const file of files) {
    bytes += (await stat(path.join(root, file))).size;
  }
  return { bytes, files: files.length };
}

export interface CreateBackupOptions {
  outDir?: string;
  includeStorage?: boolean;
  /** Répertoire des données à copier (par défaut ORGANIX_DATA_DIR). */
  dataDir?: string;
  /** Répertoire de stockage des fichiers (par défaut ORGANIX_STORAGE_DIR). */
  storageDir?: string;
}

export async function createBackup(options: CreateBackupOptions = {}): Promise<BackupManifest> {
  const driver = resolveDriver();
  const outDir = path.resolve(options.outDir ?? defaultBackupDir());
  if (await isNonEmptyDir(outDir)) {
    throw new Error(`Le répertoire de sauvegarde existe déjà et n'est pas vide : ${outDir}`);
  }
  await mkdir(outDir, { recursive: true });

  const checksums: Record<string, string> = {};
  let database: BackupManifest["database"];
  let storage: BackupManifest["storage"] = null;

  if (driver === "pglite") {
    const dataDir = path.resolve(options.dataDir ?? resolveDataDir());
    if (!(await exists(dataDir))) {
      throw new Error(
        `Répertoire PGlite introuvable : ${dataDir}. Lancez \`npm run db:migrate\` avant la sauvegarde.`,
      );
    }
    const files = await walk(dataDir);
    if (files.length === 0) {
      throw new Error(`Le répertoire PGlite est vide : ${dataDir}. Rien n'a été sauvegardé.`);
    }
    const destination = path.join(outDir, "database");
    await cp(dataDir, destination, { recursive: true });
    const copied = await walk(destination);
    const size = await treeSize(destination, copied);
    database = { kind: "pglite-directory", files: size.files, bytes: size.bytes };
    for (const [file, hash] of Object.entries(await checksumTree(destination, copied))) {
      checksums[`database/${file}`] = hash;
    }
  } else {
    const binary = spawnSync("pg_dump", ["--version"], { encoding: "utf8" });
    if (binary.error) {
      throw new Error(
        "`pg_dump` est introuvable. Installez les outils PostgreSQL (paquet `postgresql-client`) " +
          "sur la machine de sauvegarde, puis relancez la commande.",
      );
    }
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL est absente : impossible de sauvegarder PostgreSQL.");
    const target = path.join(outDir, "database.dump");
    const dump = spawnSync(
      "pg_dump",
      [databaseUrl, "--format=custom", "--no-owner", "--no-privileges", `--file=${target}`],
      { encoding: "utf8" },
    );
    if (dump.status !== 0) {
      throw new Error(`pg_dump a échoué (code ${dump.status}) : ${dump.stderr?.slice(0, 500) ?? ""}`);
    }
    const info = await stat(target);
    database = { kind: "pg_dump-custom", files: 1, bytes: info.size };
    checksums["database.dump"] = sha256(await readFile(target));
  }

  if (options.includeStorage !== false) {
    const storageDir = path.resolve(options.storageDir ?? resolveStorageDir());
    if (await exists(storageDir)) {
      const destination = path.join(outDir, "storage");
      await cp(storageDir, destination, { recursive: true });
      const copied = await walk(destination);
      const size = await treeSize(destination, copied);
      storage = { included: true, files: size.files, bytes: size.bytes };
      for (const [file, hash] of Object.entries(await checksumTree(destination, copied))) {
        checksums[`storage/${file}`] = hash;
      }
    } else {
      storage = { included: false, files: 0, bytes: 0 };
    }
  }

  const manifest: BackupManifest = {
    format: "organix-backup/v1",
    createdAt: new Date().toISOString(),
    driver,
    database,
    storage,
    checksums,
    appVersion: await readAppVersion(),
  };
  await writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

export async function readManifest(backupDir: string): Promise<BackupManifest> {
  const raw = await readFile(path.join(backupDir, "manifest.json"), "utf8").catch(() => {
    throw new Error(`Manifeste introuvable : ${path.join(backupDir, "manifest.json")}`);
  });
  const manifest = JSON.parse(raw) as BackupManifest;
  if (manifest.format !== "organix-backup/v1") {
    throw new Error(`Format de sauvegarde inconnu : ${manifest.format}`);
  }
  return manifest;
}

/** Contrôle les empreintes de la sauvegarde sans rien restaurer. */
export async function verifyChecksums(backupDir: string): Promise<{ checked: number; mismatched: string[] }> {
  const manifest = await readManifest(backupDir);
  const mismatched: string[] = [];
  let checked = 0;
  for (const [relative, expected] of Object.entries(manifest.checksums)) {
    const absolute = path.join(backupDir, relative);
    const actual = await readFile(absolute)
      .then((buffer) => sha256(buffer))
      .catch(() => "absent");
    checked += 1;
    if (actual !== expected) mismatched.push(relative);
  }
  return { checked, mismatched };
}

export interface VerifyBackupResult {
  driver: BackupDriver;
  tables: number;
  publicTables: number;
  organizations: number;
  policies: number;
  forcedRlsTables: number;
}

/**
 * Restaure la sauvegarde dans un répertoire jetable et interroge réellement la base obtenue.
 * C'est la preuve que la sauvegarde est exploitable, pas seulement qu'un fichier existe.
 */
export async function verifyBackup(backupDir: string): Promise<VerifyBackupResult> {
  const manifest = await readManifest(backupDir);
  if (manifest.driver !== "pglite") {
    throw new Error(
      "La vérification automatique n'est implémentée que pour les sauvegardes PGlite. " +
        "Pour PostgreSQL, restaurez dans une base de vérification (voir docs/sauvegarde-restauration.md).",
    );
  }
  const source = path.join(backupDir, "database");
  if (!(await exists(source))) throw new Error("Le répertoire `database/` est absent de la sauvegarde.");

  const tempRoot = await mkdtempDir();
  try {
    const target = path.join(tempRoot, "data");
    await cp(source, target, { recursive: true });
    const { PGlite } = await import("@electric-sql/pglite");
    const db = await PGlite.create({ dataDir: target });
    try {
      const tables = await db.query<{ count: number }>(
        "select count(*)::int as count from information_schema.tables where table_schema not in ('pg_catalog','information_schema')",
      );
      const publicTables = await db.query<{ count: number }>(
        "select count(*)::int as count from information_schema.tables where table_schema = 'public'",
      );
      const organizations = await db.query<{ count: number }>(
        "select count(*)::int as count from public.organizations",
      );
      const policies = await db.query<{ count: number }>(
        "select count(*)::int as count from pg_policies where schemaname = 'public'",
      );
      const forced = await db.query<{ count: number }>(
        "select count(*)::int as count from pg_class where relrowsecurity and relforcerowsecurity",
      );
      return {
        driver: "pglite",
        tables: tables.rows[0]?.count ?? 0,
        publicTables: publicTables.rows[0]?.count ?? 0,
        organizations: organizations.rows[0]?.count ?? 0,
        policies: policies.rows[0]?.count ?? 0,
        forcedRlsTables: forced.rows[0]?.count ?? 0,
      };
    } finally {
      await db.close();
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function mkdtempDir(): Promise<string> {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(path.join(os.tmpdir(), "excellence360-verify-"));
}

export interface RestoreOptions {
  from: string;
  /** Répertoire cible (PGlite). Par défaut ORGANIX_DATA_DIR. */
  target?: string;
  /** Remplace le contenu existant de la cible. */
  force?: boolean;
}

export async function restoreBackup(options: RestoreOptions): Promise<{ target: string; safetyCopy: string | null }> {
  const manifest = await readManifest(options.from);
  const integrity = await verifyChecksums(options.from);
  if (integrity.mismatched.length > 0) {
    throw new Error(
      `Sauvegarde corrompue : ${integrity.mismatched.length} fichier(s) ne correspondent pas au manifeste (${integrity.mismatched
        .slice(0, 3)
        .join(", ")}).`,
    );
  }

  if (manifest.driver !== "pglite") {
    throw new Error(
      "La restauration PostgreSQL doit être faite avec `pg_restore` dans une base de vérification " +
        "(voir docs/sauvegarde-restauration.md). Ce script refuse de toucher une base réseau sans " +
        "confirmation manuelle explicite.",
    );
  }

  const target = path.resolve(options.target ?? resolveDataDir());
  if ((await isNonEmptyDir(target)) && !options.force) {
    throw new Error(
      `Le répertoire cible n'est pas vide : ${target}. Arrêtez l'application et utilisez --force pour remplacer.`,
    );
  }

  let safetyCopy: string | null = null;
  if (await isNonEmptyDir(target)) {
    safetyCopy = `${target}.avant-restauration-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    await rename(target, safetyCopy);
  }

  await mkdir(path.dirname(target), { recursive: true });
  await cp(path.join(options.from, "database"), target, { recursive: true });

  if (manifest.storage?.included) {
    const storageSource = path.join(options.from, "storage");
    if (await exists(storageSource)) {
      const storageTarget = resolveStorageDir();
      if (await exists(storageTarget)) {
        const storageSafety = `${storageTarget}.avant-restauration-${new Date().toISOString().replace(/[:.]/g, "-")}`;
        await rename(storageTarget, storageSafety);
      }
      await cp(storageSource, storageTarget, { recursive: true });
    }
  }

  return { target, safetyCopy };
}
