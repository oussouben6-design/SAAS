import { expect, test } from "@playwright/test";

/**
 * Parcours public : page d'accueil honnête et protection des routes authentifiées.
 * Aucune donnée de démonstration n'est supposée présente.
 */
test.describe("espace public", () => {
  test("la page d'accueil distingue les modules disponibles et en développement", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/en développement/i).first()).toBeVisible();
  });

  test("une route protégée redirige vers la connexion", async ({ page }) => {
    await page.goto("/app/projets");
    await expect(page).toHaveURL(/\/connexion/);
  });

  test("la page de connexion expose les champs attendus", async ({ page }) => {
    await page.goto("/connexion");
    await expect(page.getByLabel(/adresse e-mail/i)).toBeVisible();
    await expect(page.getByLabel(/mot de passe/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /se connecter/i })).toBeVisible();
  });
});
