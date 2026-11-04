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

export const SERVERLESS_STORAGE_ERROR =
  "Stockage local impossible sur une plateforme serverless (disque éphémère) : " +
  "définissez STORAGE_DRIVER=supabase avec SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY, " +
  "et créez le bucket privé `documents`.";

export const SERVERLESS_DATABASE_ERROR =
  "Base PGlite impossible sur une plateforme serverless (disque non persistant) : " +
  "définissez DATABASE_MODE=postgres et DATABASE_URL sur le pooler PostgreSQL " +
  "(Supabase : port 6543, IPv4).";
