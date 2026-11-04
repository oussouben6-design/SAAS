import { checkEnvironment } from "../src/lib/config/env-check";
import { detectPlatform } from "../src/lib/config/platform";

/**
 * Contrôle de configuration avant déploiement (`npm run env:check`).
 * À exécuter en CI, dans Netlify (build) ou sur le serveur avant démarrage.
 * Code de sortie 1 si une erreur bloquante est détectée.
 */
const platform = detectPlatform();
const result = checkEnvironment(process.env);

console.info(`[organix:env] Plateforme : ${platform}`);
for (const note of result.notes) console.info(`  · ${note}`);

if (result.warnings.length > 0) {
  console.info("\n[organix:env] Avertissements :");
  for (const warning of result.warnings) console.warn(`  ⚠ ${warning}`);
}

if (result.errors.length > 0) {
  console.error("\n[organix:env] ERREURS bloquantes :");
  for (const error of result.errors) console.error(`  ✗ ${error}`);
  console.error(`\n${result.errors.length} erreur(s) : déploiement refusé.`);
  process.exitCode = 1;
} else {
  console.info(
    `\n[organix:env] Configuration valide${result.warnings.length > 0 ? ` (${result.warnings.length} avertissement(s))` : ""}.`,
  );
}
