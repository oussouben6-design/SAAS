import { authenticate, completeLoginOtp } from "../src/lib/auth/service";
import { closeDb } from "../src/lib/db";

/**
 * Vérification post-déploiement : connexion réelle + pages clés en HTTP.
 * À exécuter après `npm start` ou sur un environnement déployé.
 *
 *   npm run smoke -- --url https://organix.example.com
 *   npm run smoke -- --email admin@exemple.com --password '••••'
 *   npm run smoke -- --url https://... --token <jeton de session>
 *   npm run smoke -- --url https://... --otp-code 123456
 *
 * Le jeton permet de tester une API dont la base n'est pas accessible depuis la machine
 * (ex. base managée). Sans jeton, le script s'authentifie directement en base.
 * Avec AUTH_LOGIN_OTP actif (défaut), la connexion exige le code à 6 chiffres envoyé
 * par e-mail : en développement (MAIL_TRANSPORT=console) il est affiché à l'écran et
 * utilisé automatiquement ; ailleurs, fournissez --otp-code ou utilisez --token.
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
const OTP_CODE = arg("otp-code", process.env.SMOKE_OTP_CODE);

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
  "/app/parametres/securite",
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

  // ---------------------------------------------------------------- référencement (SEO)
  // Ces trois contrôles valident ce que voient Google et les aperçus de partage : sans eux, une
  // balise `noindex` héritée ou une URL canonique en `localhost` passeraient inaperçues.
  const robots = await fetch(`${BASE_URL}/robots.txt`);
  const robotsBody = await robots.text();
  checked += 1;
  const robotsOk =
    robots.status === 200 &&
    /sitemap:\s*https?:\/\//i.test(robotsBody) &&
    /disallow:\s*\/app/i.test(robotsBody);
  console.info(`${robotsOk ? "✓" : "✗"} ${robots.status} /robots.txt (sitemap déclaré, /app exclu)`);
  if (!robotsOk) failures.push(`/robots.txt → ${robots.status} : sitemap ou exclusion de /app absents`);

  const sitemap = await fetch(`${BASE_URL}/sitemap.xml`);
  const sitemapBody = await sitemap.text();
  checked += 1;
  const sitemapOk = sitemap.status === 200 && /<urlset/i.test(sitemapBody) && /<loc>https?:\/\//i.test(sitemapBody);
  console.info(`${sitemapOk ? "✓" : "✗"} ${sitemap.status} /sitemap.xml (URL absolues)`);
  if (!sitemapOk) failures.push(`/sitemap.xml → ${sitemap.status} : urlset ou URL absolue absent`);

  const home = await fetch(`${BASE_URL}/`);
  const homeHtml = await home.text();
  checked += 1;
  const canonicalMatch = homeHtml.match(/<link[^>]+rel="canonical"[^>]*>/i);
  const canonicalHref = canonicalMatch?.[0]?.match(/href="([^"]+)"/i)?.[1] ?? "";
  const seoOk =
    /property="og:title"/i.test(homeHtml) &&
    /property="og:image"/i.test(homeHtml) &&
    canonicalMatch !== null &&
    !/localhost|127\.0\.0\.1/i.test(canonicalHref) &&
    !/<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(homeHtml);
  console.info(`${seoOk ? "✓" : "✗"} ${home.status} / (canonique ${canonicalHref || "absente"}, Open Graph, indexable)`);
  if (!seoOk) failures.push(`/ → balise canonique « ${canonicalHref || "absente"} » ou Open Graph manquant, ou noindex`);

  let token = TOKEN;
  if (!token) {
    let login = await authenticate({ email: EMAIL, password: PASSWORD, ip: "smoke", userAgent: "organix-smoke" });
    if (!login.ok && login.code === "login_otp_required") {
      const code = OTP_CODE ?? login.previewCode;
      if (!code) {
        console.error(`✗ Connexion de ${EMAIL} : code de vérification envoyé par e-mail (AUTH_LOGIN_OTP).`);
        console.error("  Relancez avec --otp-code 123456 (le code reçu), utilisez --token, ou AUTH_LOGIN_OTP=false le temps du contrôle.");
        await closeDb();
        process.exitCode = 1;
        return;
      }
      const completed = await completeLoginOtp({
        challenge: login.challenge ?? "",
        code,
        ip: "smoke",
        userAgent: "organix-smoke",
      });
      if (!completed.ok) {
        console.error(`✗ Code de vérification refusé : ${completed.message}`);
        await closeDb();
        process.exitCode = 1;
        return;
      }
      login = completed;
      console.info(`✓ Code de vérification accepté pour ${EMAIL}`);
    }
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
  console.error(`[excellence360:smoke] ÉCHEC : ${(error as Error).message}`);
  process.exitCode = 1;
});
