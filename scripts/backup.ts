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

  console.info(`[organix:backup] Sauvegarde vers ${outDir}`);
  const manifest = await createBackup({ outDir, includeStorage });

  console.info(`[organix:backup] Moteur       : ${manifest.driver}`);
  console.info(
    `[organix:backup] Base         : ${manifest.database.files} fichier(s), ${manifest.database.bytes} octets (${manifest.database.kind})`,
  );
  console.info(
    `[organix:backup] Stockage     : ${
      manifest.storage?.included ? `${manifest.storage.files} fichier(s), ${manifest.storage.bytes} octets` : "non inclus"
    }`,
  );
  console.info(`[organix:backup] Manifeste    : ${path.join(outDir, "manifest.json")}`);

  const checksums = await verifyChecksums(outDir);
  console.info(
    `[organix:backup] Empreintes    : ${checksums.checked} contrôlée(s), ${checksums.mismatched.length} anomalie(s)`,
  );

  if (verify) {
    const result = await verifyBackup(outDir);
    console.info(
      `[organix:backup] Vérification : ${result.publicTables} tables publiques, ${result.organizations} organisation(s), ` +
        `${result.policies} politiques RLS (${result.forcedRlsTables} tables en RLS forcée)`,
    );
    if (result.organizations === 0) {
      throw new Error("La base restaurée ne contient aucune organisation : sauvegarde suspecte.");
    }
  }

  console.info("[organix:backup] Terminé. Copiez cette sauvegarde hors du serveur et chiffrez-la.");
}

main().catch((error: unknown) => {
  console.error(`[organix:backup] ÉCHEC : ${(error as Error).message}`);
  process.exitCode = 1;
});
