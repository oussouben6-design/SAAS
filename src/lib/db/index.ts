import { mkdir } from "node:fs/promises";
import path from "node:path";
import { BaseDb, PgliteDb, PgDb, type DbClient, type SessionContext, type SqlExecutor } from "./client";
import { runMigrations } from "./migrate";
import { isServerless, SERVERLESS_DATABASE_ERROR } from "@/lib/config/platform";

export type { DbClient, SessionContext, SqlExecutor } from "./client";

type DbGlobal = typeof globalThis & {
  __organixDb?: Promise<DbClient>;
  __organixShutdownHooks?: boolean;
};

/**
 * Arrêt propre de la base embarquée.
 *
 * Un `SIGTERM`/`SIGINT` reçu par le serveur Next.js doit fermer PGlite avant la sortie du
 * processus : un arrêt brutal en pleine écriture peut laisser le répertoire dans un état que
 * PostgreSQL-WASM ne sait pas récupérer (`RuntimeError: Aborted()` au démarrage suivant).
 * Les scripts en ligne de commande gèrent eux-mêmes leur cycle de vie (`closeDb`) et ne sont
 * donc pas concernés.
 */
function registerShutdownHooks() {
  const globalForDb = globalThis as DbGlobal;
  if (globalForDb.__organixShutdownHooks) return;
  globalForDb.__organixShutdownHooks = true;

  const isNextServer = process.argv.some(
    (arg) => arg.includes("next/dist/server") || arg.includes("next-server"),
  );
  if (!isNextServer) return;

  const shutdown = (code: number) => {
    console.info("[organix:db] arrêt du serveur, fermeture de la base…");
    closeDb()
      .catch((error: unknown) => console.error("[organix:db] fermeture impossible", error))
      .finally(() => process.exit(code));
  };
  process.once("SIGTERM", () => shutdown(143));
  process.once("SIGINT", () => shutdown(130));
}

function resolveMode(): "pglite" | "postgres" {
  const explicit = process.env.DATABASE_MODE?.toLowerCase();
  if (explicit === "postgres" || explicit === "pglite") return explicit;
  return process.env.DATABASE_URL ? "postgres" : "pglite";
}

async function bootstrap(executor: SqlExecutor) {
  await runMigrations(executor, (message) => console.info(`[organix:db] ${message}`));
}

async function createDb(): Promise<DbClient> {
  const mode = resolveMode();

  if (mode === "postgres") {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_MODE=postgres mais DATABASE_URL est absente. Renseignez la chaîne de connexion PostgreSQL.",
      );
    }
    const db = PgDb.create(connectionString);
    if (process.env.AUTO_MIGRATE === "true") {
      await db.privileged((tx) => bootstrap(tx));
    }
    return db;
  }

  if (isServerless()) {
    throw new Error(SERVERLESS_DATABASE_ERROR);
  }

  const dataDir = process.env.ORGANIX_DATA_DIR
    ? path.resolve(process.cwd(), process.env.ORGANIX_DATA_DIR)
    : path.join(process.cwd(), ".data", "pglite");
  await mkdir(path.dirname(dataDir), { recursive: true });
  registerShutdownHooks();
  return PgliteDb.create(dataDir, bootstrap);
}

export function getDb(): Promise<DbClient> {
  const globalForDb = globalThis as DbGlobal;
  if (!globalForDb.__organixDb) {
    globalForDb.__organixDb = createDb().catch((error) => {
      globalForDb.__organixDb = undefined;
      throw error;
    });
  }
  return globalForDb.__organixDb;
}

/** Contexte utilisateur sans organisation active. */
export function asUser<T>(userId: string, fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
  return getDb().then((db) => db.withSession({ userId }, fn));
}

/** Contexte utilisateur + organisation active (RLS vérifie l'appartenance). */
export function asMember<T>(
  context: SessionContext,
  fn: (tx: SqlExecutor) => Promise<T>,
): Promise<T> {
  return getDb().then((db) => db.withSession(context, fn));
}

/** Accès privilégié (migrations, service d'authentification). Jamais exposé au client. */
export function privileged<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
  return getDb().then((db) => db.privileged(fn));
}

export async function closeDb(): Promise<void> {
  const globalForDb = globalThis as DbGlobal;
  if (!globalForDb.__organixDb) return;
  const db = await globalForDb.__organixDb;
  await db.close();
  globalForDb.__organixDb = undefined;
}

export function isBaseDb(db: DbClient): db is BaseDb {
  return db instanceof BaseDb;
}
