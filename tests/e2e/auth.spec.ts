import { expect, test } from "@playwright/test";

/**
 * Parcours d'inscription et d'onboarding.
 *
 * Ce test crée une organisation réelle dans la base configurée : ne le lancez PAS sur une base de
 * production (utiliser la base PGlite de développement ou une base dédiée aux tests).
 */
test.describe("création de compte et onboarding", () => {
  test("inscription, création d'organisation puis accès au tableau de bord", async ({ page }) => {
    test.skip(
      process.env.E2E_ALLOW_SIGNUP !== "true",
      "Définir E2E_ALLOW_SIGNUP=true et AUTH_ALLOW_REGISTRATION=true pour exécuter ce test.",
    );

    const email = `e2e-${Date.now()}@organix.test`;
    const password = "MotDePasseE2E2026";

    await page.goto("/inscription");
    await page.getByLabel(/nom complet/i).fill("Utilisateur E2E");
    await page.getByLabel(/adresse e-mail/i).fill(email);
    await page.getByLabel(/^mot de passe$/i).fill(password);
    await page.getByLabel(/confirmer/i).fill(password);
    await page.getByRole("button", { name: /créer mon compte/i }).click();

    await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });
    await page.getByLabel(/nom de l'organisation/i).fill(`Organisation E2E ${Date.now()}`);
    await page.getByRole("button", { name: /créer l'organisation/i }).click();

    await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/tableau de bord/i).first()).toBeVisible();
  });
});
