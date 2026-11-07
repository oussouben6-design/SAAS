/**
 * Détection de la plateforme d'exécution.
 *
 * Sur une plateforme serverless (Netlify, Vercel, Lambda…), deux choix de développement sont
 * interdits en production :
 *  - PGlite (base embarquée) : le disque n'est ni partagé ni persistant entre invocations ;
 *  - stockage local des fichiers : le disque est éphémère, les fichiers seraient perdus.
 * La détection permet d'échouer avec un message explicite au lieu de perdre silencieusement des
 * données.
 */
export interface PlatformEnvironment {
  [key: string]: string | undefined;
}

export type Platform = "netlify" | "vercel" | "lambda" | "node";

export function detectPlatform(env: PlatformEnvironment = process.env): Platform {
  if (env.NETLIFY === "true" || env.NETLIFY_BRANCH || env.SITE_ID) return "netlify";
  if (env.VERCEL === "1" || env.VERCEL_ENV) return "vercel";
  if (env.AWS_LAMBDA_FUNCTION_NAME || env.LAMBDA_TASK_ROOT) return "lambda";
  return "node";
}

export function isServerless(env: PlatformEnvironment = process.env): boolean {
  return detectPlatform(env) !== "node";
}

/**
 * URL publique de l'application, sans exiger une variable dupliquée sur Netlify.
 * Netlify fournit URL et DEPLOY_PRIME_URL au build et aux fonctions :
 * - production : le domaine principal (URL), notamment pour les e-mails et OAuth ;
 * - preview/branche : l'URL du déploiement, afin de ne pas mélanger les environnements.
 * APP_URL reste prioritaire pour un domaine personnalisé ou un choix explicite.
 */
export function appUrlFromEnvironment(env: PlatformEnvironment = process.env): string | undefined {
  const explicit = env.APP_URL ?? env.NEXT_PUBLIC_APP_URL;
  if (explicit !== undefined) return explicit;
  if (detectPlatform(env) !== "netlify") return undefined;
  if (env.CONTEXT === "production") return env.URL ?? env.DEPLOY_PRIME_URL;
  return env.DEPLOY_PRIME_URL ?? env.URL;
}

export const SERVERLESS_STORAGE_ERROR =
  "Stockage local impossible sur une plateforme serverless (disque éphémère) : " +
  "définissez STORAGE_DRIVER=supabase avec SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY, " +
  "et créez le bucket privé `documents`.";

export const SERVERLESS_DATABASE_ERROR =
  "Base PGlite impossible sur une plateforme serverless (disque non persistant) : " +
  "définissez DATABASE_MODE=postgres et DATABASE_URL sur le pooler PostgreSQL " +
  "(Supabase : port 6543, IPv4).";
