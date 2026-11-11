/**
 * Contrôle de configuration avant déploiement.
 *
 * Fonction pure (aucun accès réseau) afin d'être testable et utilisable en CI comme au build :
 * `npm run env:check` échoue si la configuration ne peut pas fonctionner sur la cible.
 */
import { appUrlFromEnvironment, detectPlatform, type PlatformEnvironment } from "./platform";

export interface EnvCheckOptions {
  serverless?: boolean;
}

export interface EnvCheckResult {
  errors: string[];
  warnings: string[];
  notes: string[];
  /** Variables obligatoires absentes : sert à générer un remède actionnable, pas seulement un constat. */
  missing: string[];
  /** Variables non bloquantes mais à définir avant le premier déploiement. */
  recommended: string[];
}

function isHttps(url: string): boolean {
  return url.startsWith("https://");
}

function isLocalUrl(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(url);
}

function isDirectSupabaseHost(databaseUrl: string): boolean {
  try {
    const parsed = new URL(databaseUrl);
    return parsed.hostname.startsWith("db.") && parsed.hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

function validMfaKey(key: string | undefined): boolean {
  if (!key) return false;
  try {
    return Buffer.from(key.trim(), "base64").length === 32;
  } catch {
    return false;
  }
}

export function checkEnvironment(
  env: PlatformEnvironment,
  options: EnvCheckOptions = {},
): EnvCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const notes: string[] = [];
  const missing = new Set<string>();
  const recommended = new Set<string>();

  const platform = detectPlatform(env);
  const serverless = options.serverless ?? platform !== "node";
  const mode = (env.DATABASE_MODE ?? (env.DATABASE_URL ? "postgres" : "pglite")).toLowerCase();

  notes.push(`Plateforme détectée : ${platform}${serverless ? " (serverless)" : ""}`);
  notes.push(`Moteur de base : ${mode}`);

  // ---------------------------------------------------------------- base de données
  if (serverless && mode === "pglite") {
    errors.push(
      "DATABASE_MODE=pglite est inutilisable sur une plateforme serverless : le disque n'est pas persistant. " +
        "Définissez DATABASE_MODE=postgres et DATABASE_URL (pooler Supabase, port 6543).",
    );
  }
  if (mode === "postgres") {
    if (!env.DATABASE_URL) {
      errors.push("DATABASE_MODE=postgres mais DATABASE_URL est absente.");
      missing.add("DATABASE_URL");
    } else {
      if (!env.DATABASE_URL.startsWith("postgresql://") && !env.DATABASE_URL.startsWith("postgres://")) {
        errors.push("DATABASE_URL doit commencer par postgresql:// (ou postgres://).");
      }
      if (isDirectSupabaseHost(env.DATABASE_URL)) {
        warnings.push(
          "DATABASE_URL pointe sur la connexion directe Supabase (IPv6 uniquement) : utilisez le pooler " +
            "(aws-0-<région>.pooler.supabase.com:6543).",
        );
      }
      if (/localhost|127\.0\.0\.1/.test(env.DATABASE_URL) && serverless) {
        errors.push("DATABASE_URL pointe sur localhost, inaccessible depuis une plateforme serverless.");
      }
    }
    const poolMax = Number(env.DATABASE_POOL_MAX ?? "5");
    if (Number.isNaN(poolMax) || poolMax < 1) {
      errors.push("DATABASE_POOL_MAX doit être un entier ≥ 1.");
    } else if (serverless && poolMax > 5) {
      warnings.push(
        `DATABASE_POOL_MAX=${poolMax} est élevé pour du serverless : chaque instance crée son propre pool ` +
          "(2 à 3 recommandés derrière le pooler Supabase).",
      );
    }
    if (env.AUTO_MIGRATE === "true" && serverless) {
      warnings.push(
        "AUTO_MIGRATE=true exécute les migrations à chaque démarrage d'instance : préférez `npm run db:migrate` " +
          "en CI ou manuellement.",
      );
    }
  }

  // ---------------------------------------------------------------- fichiers
  const storage = (env.STORAGE_DRIVER ?? "local").toLowerCase();
  notes.push(`Moteur de stockage : ${storage}`);
  if (serverless && storage === "local") {
    errors.push(
      "STORAGE_DRIVER=local est inutilisable sur une plateforme serverless (disque éphémère) : " +
        "utilisez STORAGE_DRIVER=supabase.",
    );
  }
  if (storage === "supabase") {
    if (!env.SUPABASE_URL) {
      errors.push("SUPABASE_URL est requis lorsque STORAGE_DRIVER=supabase.");
      missing.add("SUPABASE_URL");
    }
    if (!env.SUPABASE_SERVICE_ROLE_KEY) {
      errors.push("SUPABASE_SERVICE_ROLE_KEY est requis lorsque STORAGE_DRIVER=supabase (serveur uniquement).");
      missing.add("SUPABASE_SERVICE_ROLE_KEY");
    }
    if (env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY) {
      errors.push(
        "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY est une fuite de secret : le préfixe NEXT_PUBLIC_ l'expose au navigateur.",
      );
    }
    if (env.SUPABASE_URL && !isHttps(env.SUPABASE_URL)) {
      warnings.push("SUPABASE_URL devrait utiliser https://.");
    }
  }
  const maxUpload = Number(env.MAX_UPLOAD_BYTES ?? "10485760");
  if (Number.isNaN(maxUpload) || maxUpload <= 0) {
    errors.push("MAX_UPLOAD_BYTES doit être un entier positif.");
  } else if (platform === "netlify" && maxUpload > 6 * 1024 * 1024) {
    warnings.push(
      `MAX_UPLOAD_BYTES=${Math.round(maxUpload / 1024 / 1024)} Mo dépasse la limite de corps de requête des ` +
        "fonctions Netlify (~6 Mo) : les téléversements plus gros échoueront. Réglez MAX_UPLOAD_BYTES=5242880.",
    );
  }

  // ---------------------------------------------------------------- application
  const appUrl = appUrlFromEnvironment(env) ?? "";
  if (!env.APP_URL && !env.NEXT_PUBLIC_APP_URL && appUrl && platform === "netlify") {
    notes.push(`APP_URL non définie : URL Netlify utilisée (${appUrl}).`);
  }
  if (!appUrl) {
    errors.push("APP_URL est requise (liens d'e-mail et redirections).");
    missing.add("APP_URL");
  } else {
    if (!isHttps(appUrl)) {
      if (serverless || env.NODE_ENV === "production") {
        errors.push("APP_URL doit être en https:// en production (cookies sécurisés, liens d'e-mail).");
      } else {
        warnings.push("APP_URL n'utilise pas https (acceptable uniquement en développement).");
      }
    }
    if (isLocalUrl(appUrl) && serverless) {
      errors.push("APP_URL pointe sur localhost : les liens envoyés par e-mail seraient inutilisables.");
    }
  }

  if (!validMfaKey(env.MFA_ENCRYPTION_KEY)) {
    recommended.add("MFA_ENCRYPTION_KEY");
    warnings.push(
      "MFA_ENCRYPTION_KEY absente ou invalide (32 octets base64 attendus) : la double authentification " +
        "sera indisponible. Générez-la avec `openssl rand -base64 32`.",
    );
  }

  // Connexion avec Google (OAuth) : optionnelle, mais les deux variables vont ensemble.
  const googleClientId = env.GOOGLE_CLIENT_ID?.trim();
  const googleClientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  if ((googleClientId && !googleClientSecret) || (!googleClientId && googleClientSecret)) {
    errors.push(
      "GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET doivent être définies ensemble (ou aucune des deux) : " +
        "la connexion Google resterait sinon affichée mais toujours en échec.",
    );
  } else if (googleClientId && googleClientSecret) {
    const redirectUri = `${(appUrl || "http://localhost:3000").replace(/\/$/, "")}/api/auth/google/callback`;
    notes.push(
      `Connexion Google activée — URI de redirection à déclarer dans Google Cloud : ${redirectUri}`,
    );
  } else {
    notes.push("Connexion Google désactivée (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET absentes).");
  }

  const mail = (env.MAIL_TRANSPORT ?? "console").toLowerCase();
  const loginOtp = (env.AUTH_LOGIN_OTP ?? "true").trim().toLowerCase() !== "false";
  notes.push(`Transport e-mail : ${mail}`);
  notes.push(`Code de connexion par e-mail (AUTH_LOGIN_OTP) : ${loginOtp ? "activé (par défaut)" : "désactivé"}`);
  if (mail === "console" && (env.NODE_ENV === "production" || serverless)) {
    warnings.push(
      "MAIL_TRANSPORT=console n'envoie aucun e-mail en production : configurez Resend (gratuit) pour les " +
        "invitations et la réinitialisation de mot de passe.",
    );
  }
  if (mail === "resend" && !env.RESEND_API_KEY) {
    errors.push("MAIL_TRANSPORT=resend mais RESEND_API_KEY est absente.");
    missing.add("RESEND_API_KEY");
  }
  if (mail === "smtp") {
    errors.push("MAIL_TRANSPORT=smtp n'est pas implémenté : utilisez `resend` ou `console`.");
  }
  if (env.AUTH_REQUIRE_EMAIL_VERIFICATION === "true" && mail === "console") {
    errors.push(
      "AUTH_REQUIRE_EMAIL_VERIFICATION=true avec MAIL_TRANSPORT=console bloquerait tous les comptes : " +
        "configurez un transport réel avant d'exiger la vérification.",
    );
  }
  if (loginOtp && mail === "console" && (env.NODE_ENV === "production" || serverless)) {
    errors.push(
      "AUTH_LOGIN_OTP est activé (comportement par défaut) avec MAIL_TRANSPORT=console : aucun code de " +
        "connexion ne partirait. Configurez MAIL_TRANSPORT=resend (et RESEND_API_KEY), ou définissez " +
        "AUTH_LOGIN_OTP=false pour désactiver temporairement le code de connexion — personne ne pourrait sinon se connecter.",
    );
  }
  if (loginOtp && mail === "smtp") {
    errors.push(
      "AUTH_LOGIN_OTP est activé mais MAIL_TRANSPORT=smtp n'est pas implémenté : " +
        "configurez resend, ou AUTH_LOGIN_OTP=false.",
    );
  }
  if (!env.MAINTENANCE_SECRET) {
    recommended.add("MAINTENANCE_SECRET");
    warnings.push(
      "MAINTENANCE_SECRET absente : la purge planifiée des sessions via /api/maintenance est désactivée.",
    );
  }
  if (env.AUTH_ALLOW_REGISTRATION !== "false" && env.AUTH_ALLOW_REGISTRATION !== "true") {
    notes.push("AUTH_ALLOW_REGISTRATION non défini : création libre de compte activée (valeur par défaut).");
  }

  return {
    errors,
    warnings,
    notes,
    missing: [...missing].sort(),
    recommended: [...recommended].sort(),
  };
}
