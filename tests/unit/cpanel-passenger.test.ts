import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { checkEnvironment } from "@/lib/config/env-check";
import { detectPlatform } from "@/lib/config/platform";

/**
 * Garde-fous de l'hébergement cPanel LWS (Phusion Passenger).
 *
 * Ces tests ne lancent pas Passenger (indisponible en CI), mais ils verrouillent les trois
 * points qui, s'ils régressaient, rendraient le site **inaccessible** sur cPanel :
 *   1. `passenger.cjs` existe à la racine, charge `.env.production` et appelle
 *      `listen('passenger')` — sans cet appel, Passenger finit en timeout et renvoie 503 ;
 *   2. la configuration de production attendue est acceptée par `env:check` sur une cible
 *      Node « nue » (aucune variable de plateforme serverless) ;
 *   3. les pièges propres au mutualisé sont refusés ou signalés (base en IPv6 directe,
 *      URL publique en localhost, PGlite).
 */

const MFA_KEY = randomBytes(32).toString("base64");

const CPANEL_ENV: Record<string, string> = {
  NODE_ENV: "production",
  APP_URL: "https://360crm.excellence-services-sarl.com",
  NEXT_PUBLIC_SITE_URL: "https://360crm.excellence-services-sarl.com",
  DATABASE_MODE: "postgres",
  DATABASE_URL: "postgresql://postgres.ref:secret@aws-0-eu-west-3.pooler.supabase.com:6543/postgres",
  DATABASE_POOL_MAX: "5",
  DATABASE_SSL: "true",
  AUTO_MIGRATE: "false",
  STORAGE_DRIVER: "supabase",
  SUPABASE_URL: "https://ref.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-factice",
  SUPABASE_STORAGE_BUCKET: "documents",
  MAX_UPLOAD_BYTES: "10485760",
  MAIL_TRANSPORT: "resend",
  RESEND_API_KEY: "re_factice",
  MAIL_FROM: "Excellence 360 CRM <no-reply@excellence-services-sarl.com>",
  AUTH_LOGIN_OTP: "true",
  AUTH_ALLOW_REGISTRATION: "false",
  MFA_ENCRYPTION_KEY: MFA_KEY,
  MAINTENANCE_SECRET: "secret-de-maintenance-factice",
};

describe("hébergement cPanel LWS — fichier de démarrage Passenger", () => {
  const source = readFileSync(new URL("../../passenger.cjs", import.meta.url), "utf8");

  it("se présente à Passenger avec listen('passenger') et détecte le runtime", () => {
    expect(source).toContain('typeof PhusionPassenger !== "undefined"');
    expect(source).toMatch(/listen\(\s*["']passenger["']/);
  });

  it("charge .env.production lui-même (Next.js ne le fait pas pour un serveur personnalisé)", () => {
    expect(source).toContain("@next/env");
    expect(source).toContain("loadEnvConfig");
  });

  it("prépare le serveur Next.js en production et transmet les requêtes", () => {
    expect(source).toContain("getRequestHandler");
    expect(source).toContain("app.prepare()");
    expect(source).toMatch(/dev:\s*false/);
  });

  it("n'écoute jamais un port TCP quand Passenger est présent (le port y est ignoré)", () => {
    // Seule la branche Passenger doit appeler listen('passenger') ; aucun listen(<nombre>) n'y a sa place.
    const passengerBranch = source.slice(
      source.indexOf("if (IS_PASSENGER)"),
      source.indexOf("} else {", source.indexOf("if (IS_PASSENGER)")),
    );
    expect(passengerBranch).toMatch(/server\.listen\(\s*["']passenger["']/);
    expect(passengerBranch).not.toMatch(/listen\(\s*\d/);
  });

  it("hors Passenger, se limite à la boucle locale par défaut", () => {
    expect(source).toMatch(/HOSTNAME\s*\?\?\s*["']127\.0\.0\.1["']/);
  });
});

describe("hébergement cPanel LWS — configuration de production", () => {
  it("détecte une plateforme Node (ni Netlify, ni Vercel, ni Lambda)", () => {
    expect(detectPlatform(CPANEL_ENV)).toBe("node");
  });

  it("accepte la configuration cPanel complète sans aucune erreur", () => {
    const result = checkEnvironment(CPANEL_ENV);
    expect(result.errors).toEqual([]);
    expect(result.missing).toEqual([]);
  });

  it("autorise 10 Mo de téléversement sur un serveur mutualisé (pas de limite serverless)", () => {
    const result = checkEnvironment({ ...CPANEL_ENV, MAX_UPLOAD_BYTES: "10485760" });
    expect(result.warnings.join(" ")).not.toMatch(/limite de corps de requête/i);
  });

  it("signale la connexion directe Supabase (IPv6) qui ne fonctionne pas sur cPanel", () => {
    const result = checkEnvironment({
      ...CPANEL_ENV,
      DATABASE_URL: "postgresql://postgres.ref:secret@db.ref.supabase.co:5432/postgres",
    });
    expect(result.warnings.join(" ")).toMatch(/pooler/i);
  });

  it("refuse une URL publique en localhost et une base PGlite sur une plateforme serverless", () => {
    const localhost = checkEnvironment({ ...CPANEL_ENV, APP_URL: "http://localhost:3000" });
    expect(localhost.errors.length).toBeGreaterThan(0);

    const pglite = checkEnvironment({
      ...CPANEL_ENV,
      DATABASE_MODE: "pglite",
      STORAGE_DRIVER: "local",
    }, { serverless: true });
    expect(pglite.errors.join(" ")).toMatch(/pglite/i);
  });

  it("oriente vers .env.production plutôt que systemd (remède propre à cPanel)", () => {
    const result = checkEnvironment({ NODE_ENV: "production", DATABASE_MODE: "postgres" });
    expect(result.missing).toContain("APP_URL");
    expect(result.missing).toContain("DATABASE_URL");
  });
});
