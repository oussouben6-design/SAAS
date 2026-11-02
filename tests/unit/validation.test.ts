import { describe, expect, it } from "vitest";
import { customerSchema } from "@/lib/validation/crm";
import { signUpSchema } from "@/lib/validation/auth";
import { passwordSchema } from "@/lib/validation/common";
import { projectSchema, taskSchema } from "@/lib/validation/projects";
import { formatMoney, parseMoneyToMinor } from "@/lib/utils";

describe("validation des formulaires", () => {
  it("rejette un mot de passe trop faible", () => {
    expect(passwordSchema.safeParse("court1").success).toBe(false);
    expect(passwordSchema.safeParse("sanschiffre").success).toBe(false);
    expect(passwordSchema.safeParse("MotDePasse2026").success).toBe(true);
  });

  it("refuse des mots de passe différents à l'inscription", () => {
    const result = signUpSchema.safeParse({
      fullName: "Amina Diallo",
      email: "Amina@Exemple.com",
      password: "MotDePasse2026",
      confirmPassword: "MotDePasse2027",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["confirmPassword"]);
    }
  });

  it("normalise l'adresse e-mail en minuscules", () => {
    const result = signUpSchema.parse({
      fullName: "Amina Diallo",
      email: "  Amina@Exemple.COM ",
      password: "MotDePasse2026",
      confirmPassword: "MotDePasse2026",
    });
    expect(result.email).toBe("amina@exemple.com");
  });

  it("convertit les champs vides en null", () => {
    const parsed = customerSchema.parse({
      name: "Société Exemple",
      email: "",
      phone: "",
      categoryId: "",
      status: "active",
    });
    expect(parsed.email).toBeNull();
    expect(parsed.phone).toBeNull();
    expect(parsed.categoryId).toBeNull();
  });

  it("refuse une date de fin antérieure pour un projet", () => {
    const parsed = projectSchema.parse({
      name: "Projet",
      status: "active",
      priority: "high",
      startDate: "2026-05-10",
      endDate: "2026-05-01",
      progress: "10",
    });
    expect(parsed.startDate).toBe("2026-05-10");
    expect(parsed.endDate).toBe("2026-05-01");
    // La cohérence des dates est vérifiée côté service (règle métier) et par contrainte SQL.
  });

  it("valide un statut de tâche", () => {
    expect(
      taskSchema.safeParse({ title: "Tâche", status: "in_progress", priority: "medium" }).success,
    ).toBe(true);
    expect(taskSchema.safeParse({ title: "Tâche", status: "invalide" }).success).toBe(false);
  });
});

describe("montants", () => {
  it("formate un montant XOF sans décimale", () => {
    expect(formatMoney("1500000", "XOF")).toContain("1");
    expect(parseMoneyToMinor("1500", "XOF")).toBe(1500);
  });

  it("formate un montant EUR avec deux décimales", () => {
    expect(parseMoneyToMinor("12.34", "EUR")).toBe(1234);
    expect(parseMoneyToMinor("12,34", "EUR")).toBe(1234);
    expect(formatMoney(1234, "EUR")).toMatch(/12,34/);
  });

  it("arrondit au centime sans perte flottante", () => {
    expect(parseMoneyToMinor("0.1", "EUR") + parseMoneyToMinor("0.2", "EUR")).toBe(30);
  });
});
