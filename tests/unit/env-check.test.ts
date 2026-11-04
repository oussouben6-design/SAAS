import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { checkEnvironment } from "@/lib/config/env-check";
import { detectPlatform, isServerless } from "@/lib/config/platform";

const MFA_KEY = randomBytes(32).toString("base64");

const serverlessBase = {
  NETLIFY: "true",
  NODE_ENV: "production",
  DATABASE_MODE: "postgres",
  DATABASE_URL:
    "postgresql://postgres.abcdefghij:MOTDEPASSE@aws-0-eu-west-3.pooler.supabase.com:6543/postgres",
  DATABASE_POOL_MAX: "2",
  STORAGE_DRIVER: "supabase",
  SUPABASE_URL: "https://abcdefghij.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "cle-service-role",
  APP_URL: "https://organix.exemple.com",
  MFA_ENCRYPTION_KEY: MFA_KEY,
  MAIL_TRANSPORT: "resend",
  RESEND_API_KEY: "cle-resend",
  MAINTENANCE_SECRET: "secret-de-maintenance",
};

describe("détection de plateforme", () => {
  it("reconnaît Netlify, Vercel, Lambda et un serveur classique", () => {
    expect(detectPlatform({ NETLIFY: "true" })).toBe("netlify");
    expect(detectPlatform({ VERCEL: "1" })).toBe("vercel");
    expect(detectPlatform({ AWS_LAMBDA_FUNCTION_NAME: "organix" })).toBe("lambda");
    expect(detectPlatform({})).toBe("node");
    expect(isServerless({ NETLIFY: "true" })).toBe(true);
    expect(isServerless({})).toBe(false);
  });
});

describe("contrôle de configuration avant déploiement", () => {
  it("accepte une configuration Netlify + Supabase complète", () => {
    const result = checkEnvironment(serverlessBase);
    expect(result.errors).toEqual([]);
  });

  it("refuse PGlite et le stockage local sur serverless", () => {
    const result = checkEnvironment(
      { ...serverlessBase, DATABASE_MODE: "pglite", DATABASE_URL: "", STORAGE_DRIVER: "local" },
      { serverless: true },
    );
    expect(result.errors.join(" ")).toMatch(/pglite est inutilisable/i);
    expect(result.errors.join(" ")).toMatch(/STORAGE_DRIVER=local/i);
  });

  it("signale la connexion directe Supabase (IPv6) au profit du pooler", () => {
    const result = checkEnvironment({
      ...serverlessBase,
      DATABASE_URL: "postgresql://postgres:mdp@db.abcdefghij.supabase.co:5432/postgres",
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings.join(" ")).toMatch(/pooler/i);
  });

  it("refuse un secret service_role exposé au navigateur", () => {
    const result = checkEnvironment({
      ...serverlessBase,
      NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: "fuite",
    });
    expect(result.errors.join(" ")).toMatch(/NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("refuse la vérification d'e-mail sans transport réel", () => {
    const result = checkEnvironment({
      ...serverlessBase,
      MAIL_TRANSPORT: "console",
      AUTH_REQUIRE_EMAIL_VERIFICATION: "true",
    });
    expect(result.errors.join(" ")).toMatch(/MAIL_TRANSPORT=console/);
  });

  it("refuse Resend sans clé et SMTP non implémenté", () => {
    expect(
      checkEnvironment({ ...serverlessBase, RESEND_API_KEY: "" }).errors.join(" "),
    ).toMatch(/RESEND_API_KEY/);
    expect(checkEnvironment({ ...serverlessBase, MAIL_TRANSPORT: "smtp" }).errors.join(" ")).toMatch(
      /smtp n'est pas implémenté/i,
    );
  });

  it("avertit quand les téléversements dépassent la limite de Netlify", () => {
    const result = checkEnvironment({ ...serverlessBase, MAX_UPLOAD_BYTES: "10485760" });
    expect(result.errors).toEqual([]);
    expect(result.warnings.join(" ")).toMatch(/limite de corps de requête des fonctions Netlify/i);
    expect(
      checkEnvironment({ ...serverlessBase, MAX_UPLOAD_BYTES: "5242880" }).warnings.join(" "),
    ).not.toMatch(/fonctions Netlify/i);
  });

  it("avertit sur les points non bloquants (clé MFA, pool, purge, console locale)", () => {
    const result = checkEnvironment({
      ...serverlessBase,
      MFA_ENCRYPTION_KEY: "trop-court",
      DATABASE_POOL_MAX: "20",
      MAINTENANCE_SECRET: "",
      APP_URL: "http://localhost:3000",
    });
    expect(result.warnings.join(" ")).toMatch(/MFA_ENCRYPTION_KEY/);
    expect(result.warnings.join(" ")).toMatch(/DATABASE_POOL_MAX=20/);
    expect(result.warnings.join(" ")).toMatch(/MAINTENANCE_SECRET/);
    expect(result.errors.join(" ")).toMatch(/APP_URL/);
  });
});
