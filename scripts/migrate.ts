/**
 * Applique les migrations versionnées sur la base configurée.
 * Usage : npm run db:migrate
 */
import { getDb, closeDb } from "../src/lib/db";
import { migrationStatus } from "../src/lib/db/migrate";

async function main() {
  const db = await getDb();
  console.info(`[excellence360] Moteur : ${db.driver}`);
  await db.privileged(async (tx) => {
    const status = await migrationStatus(tx);
    for (const item of status) {
      console.info(`  ${item.applied ? "✓" : "·"} ${item.name}${item.applied ? ` (${item.appliedAt})` : " — à appliquer"}`);
    }
  });
  await closeDb();
}

main().catch((error) => {
  console.error("[excellence360] Migration impossible :", error);
  process.exitCode = 1;
});
