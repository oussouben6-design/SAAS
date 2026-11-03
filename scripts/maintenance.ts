import { closeDb } from "../src/lib/db";
import { cleanupExpiredAuthRecords } from "../src/lib/auth/service";

/**
 * Maintenance planifiée (cron quotidien) : purge des sessions expirées depuis plus de 30 jours
 * et des jetons d'action expirés depuis plus de 7 jours. Aucune donnée métier n'est supprimée.
 */
async function main() {
  const startedAt = Date.now();
  await cleanupExpiredAuthRecords();
  console.info(`[organix:maintenance] Purge terminée en ${Date.now() - startedAt} ms.`);
  await closeDb();
}

main().catch(async (error: unknown) => {
  console.error(`[organix:maintenance] ÉCHEC : ${(error as Error).message}`);
  process.exitCode = 1;
  await closeDb().catch(() => {});
});
