import { checkEnvironment } from "../src/lib/config/env-check";
import { detectPlatform, type Platform } from "../src/lib/config/platform";

/**
 * Contrôle de configuration avant déploiement (`npm run env:check`).
 * À exécuter en CI, dans Netlify (build) ou sur le serveur avant démarrage.
 * Code de sortie 1 si une erreur bloquante est détectée.
 *
 * Un échec ici est *voulu* : mieux vaut un build refusé qu'un site en ligne sans accès
 * à sa base. La sortie liste donc, pour chaque variable manquante, où la renseigner et
 * d'où tirer sa valeur — sans jamais afficher de secret.
 */

/** Où renseigner une variable selon la cible. */
const WHERE: Record<Platform, string> = {
  netlify:
    "Netlify → Site configuration → Environment variables → Add (cochez « Secret » pour les clés). " +
    "La portée doit couvrir les builds ET les fonctions : une variable visible des seules fonctions " +
    "laisse ce contrôle aveugle. Après enregistrement, relancez « Deploys → Trigger deploy → " +
    "Clear cache and deploy site » : les variables ajoutées pendant un build déjà lancé ne s'y " +
    "appliquent pas. Vérification : le bloc « Resolved config → build: environment » du log liste les " +
    "noms injectés ; une variable absente de cette liste n'atteint pas le build.",
  vercel: "Vercel → Settings → Environment Variables, en portées Production et Preview, puis redéployez.",
  lambda: "Dans la configuration de la fonction (Variables d'environnement) ; les couches partagées ne " +
    "sont visibles du build que si elles y sont rattachées.",
  node:
    "Dans /etc/organix-crm.env (ou l'EnvironmentFile de l'unité systemd), puis ./scripts/deploy.sh. " +
    "En local : .env.local, lu par npm run env:check et par next dev.",
};

/** D'où tirer la valeur, pour les variables qui posent le plus de questions. */
const HOW: Record<string, string> = {
  DATABASE_URL:
    "Supabase → Project Settings → Database → Connection string → « Session pooler », port 6543. " +
    "Le port 5432 et l'hôte db.<réf>.supabase.co sont en IPv6 : injoignables depuis Netlify.",
  SUPABASE_URL: "Supabase → Project Settings → API → Project URL (https://<réf>.supabase.co).",
  SUPABASE_SERVICE_ROLE_KEY:
    "Supabase → Project Settings → API → « secret key » (service_role, JWT en eyJ…). La clé anon ne " +
    "suffit pas : le build passerait et les téléversements échoueraient au premier appel. Sans préfixe " +
    "NEXT_PUBLIC_, qui l'exposerait au navigateur.",
  APP_URL:
    "Facultatif sur Netlify : URL / DEPLOY_PRIME_URL sont utilisées automatiquement. À définir seulement " +
    "pour un domaine personnalisé.",
  RESEND_API_KEY: "resend.com → API Keys, avec MAIL_FROM = expéditeur vérifié sur le domaine.",
  MFA_ENCRYPTION_KEY: "Générez-le localement : openssl rand -base64 32.",
  MAINTENANCE_SECRET: "Générez-le localement : openssl rand -hex 32.",
};

function remedyLines(names: string[]): string[] {
  const lines: string[] = [];
  for (const name of names) {
    lines.push(`  · ${name}${HOW[name] ? ` — ${HOW[name]}` : ""}`);
  }
  return lines;
}

const platform = detectPlatform(process.env);
const result = checkEnvironment(process.env);

console.info(`[excellence360:env] Plateforme : ${platform}`);
for (const note of result.notes) console.info(`  · ${note}`);

if (result.warnings.length > 0) {
  console.info("\n[excellence360:env] Avertissements :");
  for (const warning of result.warnings) console.warn(`  ⚠ ${warning}`);
}

if (result.errors.length > 0) {
  console.error("\n[excellence360:env] ERREURS bloquantes :");
  for (const error of result.errors) console.error(`  ✗ ${error}`);
  console.error(`\n${result.errors.length} erreur(s) : déploiement refusé.`);

  if (result.missing.length > 0) {
    console.error("\n[excellence360:env] À définir :");
    for (const line of remedyLines(result.missing)) console.error(line);
    console.error(`\n[excellence360:env] ${WHERE[platform]}`);
  }
  if (result.recommended.length > 0) {
    console.info("\n[excellence360:env] Profitez-en pour poser aussi (non bloquant) :");
    for (const line of remedyLines(result.recommended)) console.info(line);
  }
  console.info(
    "\n[excellence360:env] Aucun secret ne doit transiter par le dépôt ni par les journaux : " +
      "les valeurs se saisissent sur la cible. Détail complet : docs/netlify.md.",
  );
  process.exitCode = 1;
} else {
  console.info(
    `\n[excellence360:env] Configuration valide${result.warnings.length > 0 ? ` (${result.warnings.length} avertissement(s))` : ""}.`,
  );
}
