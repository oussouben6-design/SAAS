import { authenticate } from "../src/lib/auth/service";
import { closeDb } from "../src/lib/db";

/**
 * Vérification post-déploiement : connexion réelle + pages clés en HTTP.
 * À exécuter après `npm start` ou sur un environnement déployé.
 *
 *   npm run smoke -- --url https://organix.example.com
 *   npm run smoke -- --email admin@exemple.com --password '••••'
 *   npm run smoke -- --url https://... --token <jeton de session>
 *
 * Le jeton permet de tester une API dont la base n'est pas accessible depuis la machine
 * (ex. base managée). Sans jeton, le script s'authentifie directement en base.
 */

function arg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return fallback;
}

const BASE_URL = (arg("url", process.env.SMOKE_URL ?? "http://127.0.0.1:3000") ?? "").replace(/\/$/, "");
const EMAIL = arg("email", process.env.SMOKE_EMAIL ?? "demo.admin@organix.local")!;
const PASSWORD = arg("password", process.env.SMOKE_PASSWORD ?? process.env.ORGANIX_SEED_PASSWORD ?? "Demo-Organix-2026!")!;
const TOKEN = arg("token", process.env.SMOKE_TOKEN);

const PUBLIC_PAGES = ["/", "/connexion"];
const PRIVATE_PAGES = [
  "/app",
  "/app/clients",
  "/app/prospection",
  "/app/projets",
  "/app/taches",
  "/app/documents",
  "/app/finances?vue=factures",
  "/app/rh",
  "/app/partenaires",
  "/app/communication",
  "/app/rapports",
  "/app/journal",
  "/app/recherche?q=de",
  "/app/parametres/organisation",
  "/app/parametres/profil",
  "/api/health",
];

async function main() {
  const failures: string[] = [];
  let checked = 0;

  for (const page of PUBLIC_PAGES) {
    const response = await fetch(`${BASE_URL}${page}`, { redirect: "manual" });
    checked += 1;
    const ok = response.status === 200;
    console.info(`${ok ? "✓" : "✗"} ${response.status} ${page}`);
    if (!ok) failures.push(`${page} → HTTP ${response.status}`);
  }

  const health = await fetch(`${BASE_URL}/api/health`);
  checked += 1;
  const healthBody = (await health.json().catch(() => ({}))) as {
    status?: string;
    migrations?: { applied: number; available: number };
    driver?: string;
  };
  const healthOk = health.status === 200 && healthBody.status === "ok";
  console.info(
    `${healthOk ? "✓" : "✗"} ${health.status} /api/health — ${healthBody.status ?? "?"} (${healthBody.driver ?? "?"}, ${healthBody.migrations?.applied ?? "?"}/${healthBody.migrations?.available ?? "?"} migrations)`,
  );
  if (!healthOk) failures.push(`/api/health → ${health.status} ${JSON.stringify(healthBody)}`);
  let token = TOKEN;
  if (!token) {
    const login = await authenticate({ email: EMAIL, password: PASSWORD, ip: "smoke", userAgent: "organix-smoke" });
    await closeDb();
    if (!login.ok) {
      console.error(`✗ Connexion impossible pour ${EMAIL} : ${login.message}`);
      console.error("  (base non accessible depuis cette machine ? utilisez --token)");
      process.exitCode = 1;
      return;
    }
    console.info(`✓ Connexion de ${EMAIL}`);
    token = login.data.token;
  } else {
    await closeDb();
    console.info("✓ Jeton de session fourni (--token)");
  }

  const cookie = `organix_session=${token}`;
  for (const page of PRIVATE_PAGES) {
    const response = await fetch(`${BASE_URL}${page}`, {
      headers: { cookie },
      redirect: "manual",
    });
    checked += 1;
    const ok = response.status === 200;
    console.info(`${ok ? "✓" : "✗"} ${response.status} ${page}`);
    if (!ok) failures.push(`${page} → HTTP ${response.status}`);
  }

  console.info(`\n${checked - failures.length}/${checked} contrôles réussis.`);
  if (failures.length > 0) {
    console.error("Échecs :");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(`[organix:smoke] ÉCHEC : ${(error as Error).message}`);
  process.exitCode = 1;
});
