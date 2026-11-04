import { defineConfig, devices } from "@playwright/test";

/**
 * Tests de bout en bout (Playwright).
 *
 * Prérequis : navigateur installé (`npx playwright install chromium`) et base accessible
 * (par défaut PGlite dans `.data/pglite`, migrations appliquées au démarrage).
 *
 * Ces tests n'ont PAS été exécutés dans l'environnement de développement initial
 * (téléchargement de navigateur indisponible). Voir PROJECT_STATUS.md.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "fr-FR",
    timezoneId: "Africa/Niamey",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
