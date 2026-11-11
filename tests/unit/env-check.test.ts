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

  it("accepte l'URL native de Netlify lorsque APP_URL n'est pas renseignée", () => {
    const result = checkEnvironment({
      ...serverlessBase,
      APP_URL: undefined,
      CONTEXT: "deploy-preview",
      DEPLOY_PRIME_URL: "https://deploy-preview-4--crm.netlify.app",
    });
    expect(result.errors).toEqual([]);
    expect(result.notes.join(" ")).toMatch(/URL Netlify utilisée/);
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

  it("refuse le code de connexion (défaut) sans transport réel, sauf désactivation explicite", () => {
    const on = checkEnvironment({ ...serverlessBase, MAIL_TRANSPORT: "console" });
    expect(on.errors.join(" ")).toMatch(/AUTH_LOGIN_OTP/);
    expect(on.notes.join(" ")).toMatch(/AUTH_LOGIN_OTP/);

    const off = checkEnvironment({
      ...serverlessBase,
      MAIL_TRANSPORT: "console",
      AUTH_LOGIN_OTP: "false",
    });
    expect(off.errors.join(" ")).not.toMatch(/AUTH_LOGIN_OTP/);
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

  it("valide la configuration de la connexion Google", () => {
    // Absente : simple note, aucune erreur.
    const off = checkEnvironment(serverlessBase);
    expect(off.errors).toEqual([]);
    expect(off.notes.join(" ")).toMatch(/Connexion Google désactivée/);

    // Une seule des deux variables : bloquant.
    expect(
      checkEnvironment({ ...serverlessBase, GOOGLE_CLIENT_ID: "id-sans-secret" }).errors.join(" "),
    ).toMatch(/GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET/);
    expect(
      checkEnvironment({ ...serverlessBase, GOOGLE_CLIENT_SECRET: "secret-sans-id" }).errors.join(" "),
    ).toMatch(/GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET/);

    // Les deux : activée, et l'URI de redirection exacte est rappelée.
    const on = checkEnvironment({
      ...serverlessBase,
      GOOGLE_CLIENT_ID: "123.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "GOCSPX-test",
    });
    expect(on.errors).toEqual([]);
    expect(on.notes.join(" ")).toContain(
      "https://organix.exemple.com/api/auth/google/callback",
    );
  });
});

describe("variables à définir (remedes du controle de configuration)", () => {
  it("liste les variables obligatoires absentes, sans jamais divulguer de valeur", () => {
    const withoutSecrets = { ...serverlessBase } as Record<string, string>;
    delete withoutSecrets.DATABASE_URL;
    delete withoutSecrets.SUPABASE_URL;
    delete withoutSecrets.SUPABASE_SERVICE_ROLE_KEY;

    const result = checkEnvironment(withoutSecrets);

    expect(result.errors).toHaveLength(3);
    expect(result.missing).toEqual([
      "DATABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_URL",
    ]);
    const dump = JSON.stringify(result);
    expect(dump).not.toContain("abcdefghij");
    expect(dump).not.toContain("MOTDEPASSE");
    expect(dump).not.toContain("cle-service-role");
  });

  it("reste vide et sans remede lorsque la configuration est complete", () => {
    const result = checkEnvironment(serverlessBase);

    expect(result.errors).toEqual([]);
    expect(result.missing).toEqual([]);
    expect(result.recommended).toEqual([]);
  });

  it("signale les variables non bloquantes a poser avant le premier deploiement", () => {
    const noOptional = { ...serverlessBase } as Record<string, string>;
    delete noOptional.MFA_ENCRYPTION_KEY;
    delete noOptional.MAINTENANCE_SECRET;

    const result = checkEnvironment(noOptional);

    expect(result.errors).toEqual([]);
    expect(result.recommended).toEqual(["MAINTENANCE_SECRET", "MFA_ENCRYPTION_KEY"]);
  });

  it("rend RESEND_API_KEY obligatoire des que le transport est resend", () => {
    const mailOnly = { ...serverlessBase, RESEND_API_KEY: "" } as Record<string, string>;

    const result = checkEnvironment(mailOnly);

    expect(result.missing).toEqual(["RESEND_API_KEY"]);
  });

  it("avertit du transport console meme sans NODE_ENV pose au build serverless", () => {
    const noEnvFlag = { ...serverlessBase, MAIL_TRANSPORT: "console" } as Record<string, string>;
    delete noEnvFlag.NODE_ENV;

    const result = checkEnvironment(noEnvFlag);

    expect(result.warnings.join(" ")).toMatch(/MAIL_TRANSPORT=console n'envoie aucun e-mail/);
  });
});
describe("Vercel (préflight serverless identique à Netlify)", () => {
  const vercelBase: Record<string, string> = {
    ...serverlessBase,
    NETLIFY: "",
    CONTEXT: "",
    DEPLOY_PRIME_URL: "",
    APP_URL: "",
    VERCEL: "1",
    VERCEL_ENV: "production",
    VERCEL_PROJECT_PRODUCTION_URL: "excellence360.vercel.app",
  };

  it("accepte une configuration Vercel + Supabase complète et résout l'URL native", () => {
    const env = { ...vercelBase };
    delete env.APP_URL;
    const result = checkEnvironment(env);
    expect(result.errors).toEqual([]);
    expect(result.notes.join(" ")).toMatch(/URL Vercel utilisée/);
    expect(result.notes.join(" ")).toMatch(/excellence360\.vercel\.app/);
  });

  it("résout l'URL de preview depuis VERCEL_URL (hors production)", () => {
    const env: Record<string, string> = {
      ...vercelBase,
      VERCEL_ENV: "preview",
      VERCEL_URL: "excellence360-git-branche.vercel.app",
    };
    delete env.APP_URL;
    delete env.VERCEL_PROJECT_PRODUCTION_URL;
    const result = checkEnvironment(env);
    expect(result.errors).toEqual([]);
    expect(result.notes.join(" ")).toMatch(/excellence360-git-branche\.vercel\.app/);
  });

  it("refuse PGlite et le stockage local sur Vercel, comme sur Netlify", () => {
    const result = checkEnvironment({
      ...vercelBase,
      DATABASE_MODE: "pglite",
      DATABASE_URL: "",
      STORAGE_DRIVER: "local",
    });
    expect(result.errors.join(" ")).toMatch(/pglite est inutilisable/i);
    expect(result.errors.join(" ")).toMatch(/STORAGE_DRIVER=local/i);
  });

  it("avertit au-delà de 4,5 Mo de téléversement (limite Vercel)", () => {
    const tooBig = checkEnvironment({ ...vercelBase, MAX_UPLOAD_BYTES: "5242880" });
    expect(tooBig.warnings.join(" ")).toMatch(/fonctions Vercel/i);
    const ok = checkEnvironment({ ...vercelBase, MAX_UPLOAD_BYTES: "4194304" });
    expect(ok.warnings.join(" ")).not.toMatch(/fonctions Vercel/i);
  });
});
