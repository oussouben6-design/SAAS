import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";

/**
 * Couche d'accès à la base de données.
 *
 * Deux moteurs, un seul dialecte SQL (PostgreSQL) :
 *  - `pglite`  : PostgreSQL embarqué (WASM) pour le développement local, la CI et la démonstration.
 *  - `postgres`: connexion réseau à un PostgreSQL (Supabase, ou PostgreSQL auto-hébergé).
 *
 * Les migrations `supabase/migrations/*.sql` sont identiques dans les deux cas.
 *
 * Chaque requête métier s'exécute dans une transaction avec `SET LOCAL ROLE organix_app`
 * et le contexte utilisateur positionné dans des variables de session. Les politiques RLS
 * sont donc réellement appliquées, y compris en développement.
 */

export interface SqlExecutor {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
}

export interface SessionContext {
  userId: string | null;
  organizationId?: string | null;
}

export interface DbClient {
  readonly driver: "pglite" | "postgres";
  /** Transaction avec contexte utilisateur + rôle applicatif (RLS appliquée). */
  withSession<T>(context: SessionContext, fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  /** Accès privilégié : contourne RLS. Réservé aux migrations et au service d'authentification. */
  privileged<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");
export const MIGRATIONS_PATH = MIGRATIONS_DIR;

/** Verrou FIFO pour sérialiser l'accès à une instance mono-connexion (PGlite). */
class Lock {
  private tail: Promise<void> = Promise.resolve();

  acquire(): Promise<() => void> {
    let unlock!: () => void;
    const held = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const ready = this.tail;
    this.tail = ready.then(() => held);
    return ready.then(() => unlock);
  }
}

/**
 * Verrou inter-processus du répertoire PGlite.
 *
 * PGlite n'embarque pas de verrou multi-processus : deux processus qui ouvrent le même
 * répertoire écrivent dans les mêmes fichiers et peuvent le corrompre (symptôme observé :
 * `RuntimeError: Aborted()` au démarrage suivant). Ce verrou fait échouer explicitement le
 * second processus au lieu de risquer une corruption silencieuse.
 */
const INSTANCE_LOCK = ".organix-instance.lock";

interface LockContent {
  pid: number;
  startedAt: string;
  command: string;
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Répertoires déjà ouverts par ce processus (une seconde ouverture corromprait aussi la base). */
const openDataDirs = new Set<string>();

export function acquireDataDirLock(dataDir: string): () => void {
  mkdirSync(dataDir, { recursive: true });
  const lockPath = path.join(dataDir, INSTANCE_LOCK);
  const absolute = path.resolve(dataDir);
  if (openDataDirs.has(absolute)) {
    throw new Error(
      `La base PGlite de « ${dataDir} » est déjà ouverte dans ce processus. ` +
        "Fermez l'instance existante (closeDb) avant d'en ouvrir une nouvelle.",
    );
  }
  const content: LockContent = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    command: process.argv.slice(0, 3).join(" ").slice(0, 200),
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = openSync(lockPath, "wx");
      writeSync(fd, JSON.stringify(content));
      closeSync(fd);
      openDataDirs.add(absolute);
      const release = () => {
        openDataDirs.delete(absolute);
        try {
          const current = JSON.parse(readFileSync(lockPath, "utf8")) as LockContent;
          if (current.pid === process.pid) unlinkSync(lockPath);
        } catch {
          // Verrou déjà supprimé : rien à faire.
        }
      };
      process.once("exit", release);
      return release;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      let holder: LockContent | null = null;
      try {
        holder = JSON.parse(readFileSync(lockPath, "utf8")) as LockContent;
      } catch {
        holder = null;
      }
      if (holder && holder.pid !== process.pid && isProcessAlive(holder.pid)) {
        throw new Error(
          `La base PGlite de « ${dataDir} » est déjà utilisée par le processus ${holder.pid}` +
            ` (${holder.command}, depuis ${holder.startedAt}). ` +
            "Arrêtez-le (par exemple `npm run dev`) avant de lancer une commande base de données. " +
            "Deux processus simultanés sur le même répertoire PGlite le corrompent.",
        );
      }
      // Verrou orphelin (processus mort) : on le remplace.
      try {
        unlinkSync(lockPath);
      } catch {
        // Course bénigne avec un autre processus : la tentative suivante échouera proprement.
      }
    }
  }
  throw new Error(`Impossible d'obtenir le verrou de la base PGlite « ${dataDir} ».`);
}

export abstract class BaseDb implements DbClient {
  abstract readonly driver: "pglite" | "postgres";

  protected abstract lease(): Promise<{ executor: SqlExecutor; release: () => void }>;

  async withSession<T>(context: SessionContext, fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    const { executor: conn, release } = await this.lease();
    try {
      await conn.exec("begin");
      await conn.exec("set local role organix_app");
      await conn.query("select set_config('organix.user_id', $1, true)", [context.userId]);
      await conn.query("select set_config('organix.organization_id', $1, true)", [
        context.organizationId ?? null,
      ]);
      const result = await fn(conn);
      await conn.exec("commit");
      return result;
    } catch (error) {
      try {
        await conn.exec("rollback");
      } catch {
        // La transaction peut déjà être terminée : on propage l'erreur d'origine.
      }
      throw error;
    } finally {
      release();
    }
  }

  async privileged<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    const { executor, release } = await this.lease();
    try {
      return await fn(executor);
    } finally {
      release();
    }
  }

  abstract close(): Promise<void>;
}

export class PgliteDb extends BaseDb {
  readonly driver = "pglite" as const;
  private readonly lock = new Lock();

  private constructor(
    private readonly db: PGlite,
    private readonly releaseLock: () => void,
  ) {
    super();
  }

  static async create(
    dataDir: string,
    onReady?: (executor: SqlExecutor) => Promise<void>,
  ): Promise<PgliteDb> {
    const releaseLock = acquireDataDirLock(dataDir);
    let pglite: PGlite;
    try {
      pglite = await PGlite.create({ dataDir });
    } catch (error) {
      releaseLock();
      throw error;
    }
    const executor: SqlExecutor = {
      query: async <T>(text: string, params?: unknown[]) => {
        const result = await pglite.query<T>(text, params);
        return result.rows;
      },
      exec: async (sql: string) => {
        await pglite.exec(sql);
      },
    };
    const instance = new PgliteDb(pglite, releaseLock);
    if (onReady) {
      const unlock = await instance.lock.acquire();
      try {
        await onReady(executor);
      } finally {
        unlock();
      }
    }
    return instance;
  }

  protected async lease(): Promise<{ executor: SqlExecutor; release: () => void }> {
    const unlock = await this.lock.acquire();
    const pglite = this.db;
    return {
      executor: {
        query: async <T>(text: string, params?: unknown[]) => {
          const result = await pglite.query<T>(text, params);
          return result.rows;
        },
        exec: async (sql: string) => {
          await pglite.exec(sql);
        },
      },
      release: unlock,
    };
  }

  async close(): Promise<void> {
    try {
      await this.db.close();
    } finally {
      this.releaseLock();
    }
  }
}

export class PgDb extends BaseDb {
  readonly driver = "postgres" as const;

  private constructor(private readonly pool: Pool) {
    super();
  }

  static create(connectionString: string): PgDb {
    const pool = new Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      ssl: process.env.DATABASE_SSL === "false" ? undefined : { rejectUnauthorized: false },
      application_name: "organix",
    });
    return new PgDb(pool);
  }

  protected async lease(): Promise<{ executor: SqlExecutor; release: () => void }> {
    const client = await this.pool.connect();
    return {
      executor: {
        query: async <T>(text: string, params?: unknown[]) =>
          (await client.query(text, params)).rows as T[],
        exec: async (sql: string) => {
          await client.query(sql);
        },
      },
      release: () => client.release(),
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
