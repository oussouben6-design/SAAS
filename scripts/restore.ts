import { restoreBackup, verifyChecksums } from "../src/lib/backup";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const from = arg("depuis") ?? arg("from");
  const target = arg("cible") ?? arg("target");
  const force = process.argv.includes("--force");

  if (!from) {
    throw new Error(
      "Indiquez le répertoire de sauvegarde : npm run db:restore -- --depuis backups/excellence360-AAAA...",
    );
  }
  if (!force && !process.argv.includes("--yes")) {
    throw new Error(
      "Restauration destructive : arrêtez l'application puis ajoutez --yes (et --force pour remplacer la base existante).",
    );
  }

  const checksums = await verifyChecksums(from);
  if (checksums.mismatched.length > 0) {
    throw new Error(`Sauvegarde invalide : ${checksums.mismatched.join(", ")}`);
  }
  console.info(`[excellence360:restore] ${checksums.checked} empreinte(s) valides.`);

  const result = await restoreBackup({ from, target, force });
  console.info(`[excellence360:restore] Base restaurée dans ${result.target}`);
  if (result.safetyCopy) {
    console.info(`[excellence360:restore] Ancienne base conservée : ${result.safetyCopy}`);
  }
  console.info("[excellence360:restore] Démarrez l'application puis exécutez `npm run db:status` pour contrôler l'état.");
}

main().catch((error: unknown) => {
  console.error(`[excellence360:restore] ÉCHEC : ${(error as Error).message}`);
  process.exitCode = 1;
});
