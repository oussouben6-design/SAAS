/**
 * Réinitialise la base de DÉVELOPPEMENT locale (PGlite) et, si demandé, le stockage local.
 *
 * Opération destructive : elle exige le drapeau `--yes`.
 * Elle ne fonctionne JAMAIS sur une base PostgreSQL distante (Supabase) : dans ce cas,
 * la procédure manuelle est affichée et rien n'est supprimé.
 *
 * Usage : npm run db:reset -- --yes [--keep-storage]
 */
import { rm, stat } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.resolve(process.cwd(), process.env.ORGANIX_DATA_DIR ?? ".data/pglite");
const STORAGE_DIR = path.resolve(
  process.cwd(),
  process.env.ORGANIX_STORAGE_DIR ?? ".data/storage",
);

function isInsideRepository(target: string): boolean {
  const root = process.cwd();
  return target === root || target.startsWith(root + path.sep);
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const confirmed = process.argv.includes("--yes");
  const keepStorage = process.argv.includes("--keep-storage");

  if (process.env.DATABASE_MODE === "postgres" || (!process.env.DATABASE_MODE && process.env.DATABASE_URL)) {
    console.error(
      "[reset] Refusé : la configuration pointe vers un PostgreSQL distant (DATABASE_MODE=postgres).\n" +
        "        Aucune donnée n'a été supprimée.\n" +
        "        Pour repartir de zéro sur Supabase, créez un nouveau projet ou exécutez\n" +
        "        manuellement `drop schema public cascade; create schema public;` puis les migrations\n" +
        "        (voir docs/installation.md, section « Réinitialisation »).",
    );
    process.exitCode = 1;
    return;
  }

  if (!isInsideRepository(DATA_DIR) || !isInsideRepository(STORAGE_DIR)) {
    console.error("[reset] Refusé : répertoire hors du dépôt, suppression annulée.");
    process.exitCode = 1;
    return;
  }

  const targets = [DATA_DIR];
  if (!keepStorage && (await exists(STORAGE_DIR))) targets.push(STORAGE_DIR);

  console.info("[reset] Cibles de la suppression :");
  for (const target of targets) {
    console.info(`  - ${path.relative(process.cwd(), target)}${(await exists(target)) ? "" : " (absent)"}`);
  }

  if (!confirmed) {
    console.error(
      "\n[reset] Aucune suppression effectuée. Relancez avec `npm run db:reset -- --yes`\n" +
        "        après avoir vérifié que ces répertoires ne contiennent aucune donnée réelle.\n" +
        "        --keep-storage conserve les fichiers téléversés.",
    );
    process.exitCode = 1;
    return;
  }

  for (const target of targets) {
    if (await exists(target)) {
      await rm(target, { recursive: true, force: true });
      console.info(`[reset] Supprimé : ${path.relative(process.cwd(), target)}`);
    }
  }

  console.info(
    "\n[reset] Terminé. La base sera recréée (migrations) à la première commande\n" +
      "        `npm run db:status`, `npm run db:migrate` ou au démarrage de l'application.\n" +
      "        Pour un espace de démonstration : `npm run db:seed`.",
  );
}

main().catch((error) => {
  console.error("[reset] Échec :", error);
  process.exitCode = 1;
});
