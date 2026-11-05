import path from "node:path";
import { createBackup, defaultBackupDir, verifyBackup, verifyChecksums } from "../src/lib/backup";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const outDir = arg("out") ?? defaultBackupDir();
  const includeStorage = !process.argv.includes("--sans-stockage");
  const verify = process.argv.includes("--verifier");

  console.info(`[excellence360:backup] Sauvegarde vers ${outDir}`);
  const manifest = await createBackup({ outDir, includeStorage });

  console.info(`[excellence360:backup] Moteur       : ${manifest.driver}`);
  console.info(
    `[excellence360:backup] Base         : ${manifest.database.files} fichier(s), ${manifest.database.bytes} octets (${manifest.database.kind})`,
  );
  console.info(
    `[excellence360:backup] Stockage     : ${
      manifest.storage?.included ? `${manifest.storage.files} fichier(s), ${manifest.storage.bytes} octets` : "non inclus"
    }`,
  );
  console.info(`[excellence360:backup] Manifeste    : ${path.join(outDir, "manifest.json")}`);

  const checksums = await verifyChecksums(outDir);
  console.info(
    `[excellence360:backup] Empreintes    : ${checksums.checked} contrôlée(s), ${checksums.mismatched.length} anomalie(s)`,
  );

  if (verify) {
    const result = await verifyBackup(outDir);
    console.info(
      `[excellence360:backup] Vérification : ${result.publicTables} tables publiques, ${result.organizations} organisation(s), ` +
        `${result.policies} politiques RLS (${result.forcedRlsTables} tables en RLS forcée)`,
    );
    if (result.organizations === 0) {
      throw new Error("La base restaurée ne contient aucune organisation : sauvegarde suspecte.");
    }
  }

  console.info("[excellence360:backup] Terminé. Copiez cette sauvegarde hors du serveur et chiffrez-la.");
}

main().catch((error: unknown) => {
  console.error(`[excellence360:backup] ÉCHEC : ${(error as Error).message}`);
  process.exitCode = 1;
});
