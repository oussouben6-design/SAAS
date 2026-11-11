import { randomInt } from "node:crypto";
import type { SqlExecutor } from "@/lib/db";
import { privileged } from "@/lib/db";
import { hashPassword, verifyPassword } from "./password";
import { generateToken, hashToken } from "./tokens";
import { appBaseUrl, sendMail, type MailResult } from "@/lib/mail";
import { verifyChallenge } from "./mfa";

/**
 * Service d'authentification.
 *
 * C'est le seul composant autorisé à utiliser une connexion privilégiée : les tables
 * `user_credentials`, `sessions` et `verification_tokens` n'ont aucune politique RLS
 * et sont donc inaccessibles via le rôle applicatif `organix_app`.
 */

const SESSION_DURATION_DAYS = 7;
const SESSION_RENEW_THRESHOLD_MS = 3.5 * 24 * 60 * 60 * 1000;
const VERIFICATION_TTL_MINUTES = 60 * 24;
const RESET_TTL_MINUTES = 60;
const LOGIN_OTP_TTL_MINUTES = 10;
const LOGIN_OTP_MAX_ATTEMPTS = 5;

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  emailVerifiedAt: string | null;
  isActive: boolean;
}

export interface SessionInfo {
  user: AuthUser;
  expiresAt: string;
}

export type AuthFailureCode =
  | "invalid_credentials"
  | "email_taken"
  | "inactive_account"
  | "registration_disabled"
  | "invalid_token"
  | "expired_token"
  | "weak_password"
  | "mfa_required"
  | "mfa_invalid_code"
  | "login_otp_required"
  | "login_otp_invalid"
  | "unknown";

export type AuthResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: AuthFailureCode; message: string; challenge?: string; previewCode?: string };

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function mapProfile(row: {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  email_verified_at: string | null;
  is_active: boolean;
}): AuthUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    emailVerifiedAt: row.email_verified_at,
    isActive: row.is_active,
  };
}

export async function findUserByEmail(email: string): Promise<AuthUser | null> {
  return privileged(async (tx) => {
    const rows = await tx.query<{
      id: string;
      email: string;
      full_name: string;
      avatar_url: string | null;
      email_verified_at: string | null;
      is_active: boolean;
    }>(
      `select id, email, full_name, avatar_url, email_verified_at, is_active
       from profiles where lower(email) = $1`,
      [normalizeEmail(email)],
    );
    const row = rows[0];
    return row ? mapProfile(row) : null;
  });
}

export async function createUserAccount(input: {
  email: string;
  fullName: string;
  password: string;
  emailVerified?: boolean;
}): Promise<AuthResult<{ user: AuthUser; verification?: MailResult }>> {
  const email = normalizeEmail(input.email);
  const password = await hashPassword(input.password);

  return privileged(async (tx) => {
    const existing = await tx.query<{ id: string }>(
      "select id from profiles where lower(email) = $1",
      [email],
    );
    if (existing.length > 0) {
      return {
        ok: false as const,
        code: "email_taken" as const,
        message: "Un compte existe déjà avec cette adresse e-mail.",
      };
    }

    const inserted = await tx.query<{ id: string }>(
      `insert into profiles (email, full_name, email_verified_at)
       values ($1, $2, $3) returning id`,
      [email, input.fullName.trim(), input.emailVerified ? new Date() : null],
    );
    const userId = inserted[0]!.id;

    await tx.query(
      `insert into user_credentials (user_id, password_hash, password_salt, algorithm)
       values ($1, $2, $3, $4)`,
      [userId, password.hash, password.salt, password.algorithm],
    );

    let verification: MailResult | undefined;
    if (!input.emailVerified) {
      verification = await issueToken(tx, userId, "email_verification", VERIFICATION_TTL_MINUTES);
    }

    return {
      ok: true as const,
      data: {
        user: {
          id: userId,
          email,
          fullName: input.fullName.trim(),
          avatarUrl: null,
          emailVerifiedAt: input.emailVerified ? new Date().toISOString() : null,
          isActive: true,
        },
        verification,
      },
    };
  });
}

async function issueToken(
  tx: SqlExecutor,
  userId: string,
  purpose: "email_verification" | "password_reset" | "invitation",
  ttlMinutes: number,
  email?: string,
  fullName?: string,
): Promise<MailResult> {
  const token = generateToken();
  await tx.query(
    `insert into verification_tokens (user_id, purpose, token_hash, expires_at)
     values ($1, $2, $3, now() + ($4 || ' minutes')::interval)`,
    [userId, purpose, hashToken(token), String(ttlMinutes)],
  );

  const base = appBaseUrl();
  const path =
    purpose === "email_verification"
      ? `/verifier-email?token=${token}`
      : purpose === "password_reset"
        ? `/reinitialiser-mot-de-passe?token=${token}`
        : `/invitations/${token}`;

  const result = await sendMail({
    to: (email ?? "").trim(),
    kind: purpose,
    subject:
      purpose === "email_verification"
        ? "Excellence 360 CRM — Vérifiez votre adresse e-mail"
        : purpose === "password_reset"
          ? "Excellence 360 CRM — Réinitialisation de votre mot de passe"
          : "Excellence 360 CRM — Invitation à rejoindre une organisation",
    actionUrl: `${base}${path}`,
    lines: fullName ? [`Bonjour ${fullName},`] : undefined,
  });
  return result;
}

export async function sendEmailVerification(userId: string): Promise<MailResult> {
  return privileged(async (tx) => {
    const profile = await tx.query<{ email: string; full_name: string; email_verified_at: string | null }>(
      "select email, full_name, email_verified_at from profiles where id = $1",
      [userId],
    );
    const row = profile[0];
    if (!row) return { delivered: false, transport: "none", warning: "Profil introuvable." };
    if (row.email_verified_at) {
      return { delivered: false, transport: "none", warning: "Cette adresse est déjà vérifiée." };
    }
    return issueToken(tx, userId, "email_verification", VERIFICATION_TTL_MINUTES, row.email, row.full_name);
  });
}

export async function verifyEmailToken(token: string): Promise<AuthResult<{ email: string }>> {
  return privileged(async (tx) => {
    const rows = await tx.query<{ id: string; user_id: string; email: string }>(
      `select t.id, t.user_id, p.email
       from verification_tokens t
       join profiles p on p.id = t.user_id
       where t.token_hash = $1 and t.purpose = 'email_verification' and t.used_at is null
         and t.expires_at > now()`,
      [hashToken(token)],
    );
    const row = rows[0];
    if (!row) {
      return {
        ok: false as const,
        code: "invalid_token" as const,
        message: "Ce lien de vérification est invalide ou expiré.",
      };
    }
    await tx.query("update verification_tokens set used_at = now() where id = $1", [row.id]);
    await tx.query("update profiles set email_verified_at = now() where id = $1", [row.user_id]);
    return { ok: true as const, data: { email: row.email } };
  });
}

export async function authenticate(input: {
  email: string;
  password: string;
  ip: string | null;
  userAgent: string | null;
}): Promise<AuthResult<{ token: string; expiresAt: Date; user: AuthUser }>> {
  const email = normalizeEmail(input.email);

  return privileged(async (tx) => {
    const rows = await tx.query<{
      id: string;
      email: string;
      full_name: string;
      avatar_url: string | null;
      email_verified_at: string | null;
      is_active: boolean;
      password_hash: string;
      password_salt: string;
      algorithm: string;
    }>(
      `select p.id, p.email, p.full_name, p.avatar_url, p.email_verified_at, p.is_active,
              c.password_hash, c.password_salt, c.algorithm
       from profiles p
       join user_credentials c on c.user_id = p.id
       where lower(p.email) = $1`,
      [email],
    );
    const row = rows[0];

    // Comparaison systématique pour ne pas révéler l'existence d'un compte par le temps de réponse.
    const dummy = {
      hash: "00".repeat(64),
      salt: "00".repeat(16),
      algorithm: "scrypt:32768:8:1",
    };
    const valid = await verifyPassword(
      input.password,
      row ? { hash: row.password_hash, salt: row.password_salt, algorithm: row.algorithm } : dummy,
    );

    if (!row || !valid) {
      return {
        ok: false as const,
        code: "invalid_credentials" as const,
        message: "Adresse e-mail ou mot de passe incorrect.",
      };
    }
    if (!row.is_active) {
      return {
        ok: false as const,
        code: "inactive_account" as const,
        message: "Ce compte est désactivé. Contactez un administrateur.",
      };
    }

    return finishSignIn(tx, mapProfile(row), input);
  });
}

/** Le code de connexion par e-mail est exigé à chaque connexion, sauf désactivation explicite. */
export function loginOtpEnabled(): boolean {
  return (process.env.AUTH_LOGIN_OTP ?? "true").trim().toLowerCase() !== "false";
}

/**
 * Le code de connexion est-il aussi exigé après une connexion Google ?
 * Par défaut NON : le jeton d'identité Google (vérifié côté serveur — signature,
 * audience, nonce, `email_verified`) prouve la propriété de l'adresse, ce qui en
 * fait la vérification « en un clic ». La double authentification TOTP, elle,
 * reste demandée après Google si elle est active sur le compte.
 * `AUTH_LOGIN_OTP_GOOGLE=true` rétablit le code e-mail après une connexion Google.
 */
export function loginOtpGoogleEnabled(): boolean {
  return (process.env.AUTH_LOGIN_OTP_GOOGLE ?? "false").trim().toLowerCase() === "true";
}

/**
 * Canal de connexion porté par un défi MFA (suffixe « .google » ou « .password »).
 * Le suffixe fait partie du jeton haché stocké : il ne peut pas être modifié par le
 * client sans invalider le défi. Les défis émis avant cette version (sans suffixe)
 * sont traités comme « password ».
 */
function challengeVia(challenge: string): "password" | "google" {
  return challenge.endsWith(".google") ? "google" : "password";
}

/** Crée la session (jeton aléatoire haché, 7 jours) et marque la dernière activité. */
async function createSession(
  tx: SqlExecutor,
  userId: string,
  meta: { ip: string | null; userAgent: string | null },
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);
  await tx.query(
    `insert into sessions (user_id, token_hash, ip, user_agent, expires_at)
     values ($1, $2, $3, $4, $5)`,
    [userId, hashToken(token), meta.ip, meta.userAgent, expiresAt],
  );
  await tx.query("update profiles set last_seen_at = now() where id = $1", [userId]);
  return { token, expiresAt };
}

/**
 * Émet le code à usage unique envoyé par e-mail à la connexion (OTP).
 * Le code (6 chiffres) n'est jamais stocké en clair : seul son empreinte scrypt est conservée.
 * Retourne le défi opaque à remettre au navigateur ; en développement (transport console),
 * le code est aussi renvoyé sous `previewCode` pour affichage à l'écran.
 */
async function issueLoginChallenge(
  tx: SqlExecutor,
  user: AuthUser,
  meta: { ip: string | null; userAgent: string | null },
): Promise<{ challenge: string; previewCode?: string }> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const codeHash = await hashPassword(code);
  const expiresAt = new Date(Date.now() + LOGIN_OTP_TTL_MINUTES * 60 * 1000);
  const challenge = generateToken(32);

  await tx.query(
    "delete from login_challenges where user_id = $1 and (expires_at <= now() or consumed_at is not null)",
    [user.id],
  );
  await tx.query(
    `insert into login_challenges (user_id, token_hash, code_hash, expires_at, ip, user_agent)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      user.id,
      hashToken(challenge),
      `${codeHash.algorithm}$${codeHash.salt}$${codeHash.hash}`,
      expiresAt,
      meta.ip,
      meta.userAgent,
    ],
  );

  const mail = await sendMail({
    to: user.email,
    kind: "login_otp",
    subject: "Excellence 360 CRM — Votre code de connexion",
    actionUrl: `${appBaseUrl()}/connexion`,
    lines: [
      `Bonjour ${user.fullName},`,
      "Quelqu'un (vous, espérons-le) termine une connexion à votre compte. Saisissez ce code pour l'autoriser :",
    ],
    code,
  });

  return { challenge, previewCode: mail.previewCode };
}

/**
 * Étape finale commune à toutes les connexions dont l'identité est prouvée
 * (mot de passe ou Google) : la double authentification TOTP est exigée si elle
 * est active ; puis, sauf désactivation explicite, un code à usage unique est
 * envoyé par e-mail — aucune session n'est créée avant sa saisie.
 * Le code e-mail est désactivable par AUTH_LOGIN_OTP=false (dernier recours) ;
 * après une connexion Google il n'est PAS exigé par défaut (le jeton d'identité
 * prouve l'adresse) — AUTH_LOGIN_OTP_GOOGLE=true le rétablit.
 * Sinon la session est créée.
 */
async function finishSignIn(
  tx: SqlExecutor,
  user: AuthUser,
  meta: { ip: string | null; userAgent: string | null },
  options: { via: "password" | "google" } = { via: "password" },
): Promise<AuthResult<{ token: string; expiresAt: Date; user: AuthUser }>> {
  const mfa = await tx.query<{ confirmed_at: string }>(
    "select confirmed_at from user_mfa where user_id = $1 and confirmed_at is not null",
    [user.id],
  );
  if (mfa.length > 0) {
    const challenge = `${generateToken(32)}.${options.via}`;
    const challengeExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await tx.query("delete from mfa_challenges where user_id = $1 and expires_at < now()", [user.id]);
    await tx.query(
      `insert into mfa_challenges (user_id, token_hash, expires_at, ip, user_agent)
       values ($1, $2, $3, $4, $5)`,
      [user.id, hashToken(challenge), challengeExpiresAt, meta.ip, meta.userAgent],
    );
    return {
      ok: false as const,
      code: "mfa_required" as const,
      message: "Saisissez le code à 6 chiffres de votre application d'authentification.",
      challenge,
    };
  }

  const requireOtp = loginOtpEnabled() && (options.via !== "google" || loginOtpGoogleEnabled());
  if (requireOtp) {
    const { challenge, previewCode } = await issueLoginChallenge(tx, user, meta);
    return {
      ok: false as const,
      code: "login_otp_required" as const,
      message: "Saisissez le code à 6 chiffres qui vient d'être envoyé à votre adresse e-mail.",
      challenge,
      previewCode,
    };
  }

  const { token, expiresAt } = await createSession(tx, user.id, meta);
  return { ok: true as const, data: { token, expiresAt, user } };
}

function googleDisplayName(name: string | null, email: string): string {
  const candidate = (name ?? "").trim().slice(0, 120);
  if (candidate.length >= 2) return candidate;
  const local = (email.split("@")[0] ?? "").replace(/[._-]+/g, " ").trim().slice(0, 120);
  return local.length >= 2 ? local : "Utilisateur Google";
}

/**
 * Connexion via un profil Google déjà vérifié cryptographiquement
 * (voir `verifyGoogleIdToken`). Règles de liaison, dans l'ordre :
 *  1. identité Google connue (`sub`) → le compte lié, même si l'e-mail Google a changé ;
 *  2. compte existant avec la même adresse e-mail → liaison automatique
 *     (Google a prouvé la propriété de l'adresse ; elle est marquée vérifiée) ;
 *  3. sinon → création d'un compte sans mot de passe, sauf si la création
 *     libre de compte est désactivée (`AUTH_ALLOW_REGISTRATION=false`).
 * La double authentification éventuelle s'applique ensuite, comme pour le mot de passe.
 */
export async function signInWithGoogle(
  profile: { subject: string; email: string; emailVerified: boolean; name: string | null },
  meta: { ip: string | null; userAgent: string | null },
): Promise<AuthResult<{ token: string; expiresAt: Date; user: AuthUser; accountCreated: boolean }>> {
  const email = normalizeEmail(profile.email);

  return privileged(async (tx) => {
    type ProfileRow = Parameters<typeof mapProfile>[0];

    const byIdentity = await tx.query<ProfileRow & { identity_id: string }>(
      `select p.id, p.email, p.full_name, p.avatar_url, p.email_verified_at, p.is_active,
              i.id as identity_id
       from user_identities i
       join profiles p on p.id = i.user_id
       where i.provider = 'google' and i.provider_subject = $1`,
      [profile.subject],
    );

    let user: AuthUser | null = byIdentity[0] ? mapProfile(byIdentity[0]) : null;
    const identityId: string | null = byIdentity[0]?.identity_id ?? null;
    let accountCreated = false;

    if (!user) {
      const byEmail = await tx.query<ProfileRow>(
        `select id, email, full_name, avatar_url, email_verified_at, is_active
         from profiles where lower(email) = $1`,
        [email],
      );
      if (byEmail[0]) user = mapProfile(byEmail[0]);
    }

    if (!user) {
      if (process.env.AUTH_ALLOW_REGISTRATION === "false") {
        return {
          ok: false as const,
          code: "registration_disabled" as const,
          message:
            "La création de compte est désactivée. Demandez une invitation à votre administrateur.",
        };
      }
      const inserted = await tx.query<ProfileRow>(
        `insert into profiles (email, full_name, email_verified_at)
         values ($1, $2, now())
         returning id, email, full_name, avatar_url, email_verified_at, is_active`,
        [email, googleDisplayName(profile.name, email)],
      );
      user = mapProfile(inserted[0]!);
      accountCreated = true;
    }

    if (!user.isActive) {
      return {
        ok: false as const,
        code: "inactive_account" as const,
        message: "Ce compte est désactivé. Contactez un administrateur.",
      };
    }

    if (!identityId) {
      await tx.query(
        `insert into user_identities (user_id, provider, provider_subject, provider_email, last_sign_in_at)
         values ($1, 'google', $2, $3, now())`,
        [user.id, profile.subject, email],
      );
      if (!user.emailVerifiedAt) {
        await tx.query(
          "update profiles set email_verified_at = now() where id = $1 and email_verified_at is null",
          [user.id],
        );
        user = { ...user, emailVerifiedAt: new Date().toISOString() };
      }
    } else {
      await tx.query(
        "update user_identities set provider_email = $2, last_sign_in_at = now() where id = $1",
        [identityId, email],
      );
    }

    const result = await finishSignIn(tx, user, meta, { via: "google" });
    if (!result.ok) return result;
    return { ok: true as const, data: { ...result.data, accountCreated } };
  });
}

/** Le compte a-t-il un mot de passe ? (Un compte créé via Google n'en a pas.) */
export async function hasPasswordCredentials(userId: string): Promise<boolean> {
  return privileged(async (tx) => {
    const rows = await tx.query<{ user_id: string }>(
      "select user_id from user_credentials where user_id = $1",
      [userId],
    );
    return rows.length > 0;
  });
}

export interface GoogleIdentitySummary {
  email: string | null;
  linkedAt: string;
  lastSignInAt: string | null;
}

/** Liaison Google du compte, pour l'écran de sécurité (lecture seule). */
export async function getGoogleIdentitySummary(userId: string): Promise<GoogleIdentitySummary | null> {
  return privileged(async (tx) => {
    const rows = await tx.query<{
      provider_email: string | null;
      created_at: string;
      last_sign_in_at: string | null;
    }>(
      `select provider_email, created_at, last_sign_in_at
       from user_identities where user_id = $1 and provider = 'google'`,
      [userId],
    );
    const row = rows[0];
    return row
      ? { email: row.provider_email, linkedAt: row.created_at, lastSignInAt: row.last_sign_in_at }
      : null;
  });
}

/**
 * Seconde étape de connexion : vérifie le défi + le code TOTP (ou un code de secours),
 * puis ouvre la session. Utilise le même délai et le même renouvellement que `authenticate`.
 */
export async function completeMfaLogin(input: {
  challenge: string;
  code: string;
  ip: string | null;
  userAgent: string | null;
}): Promise<AuthResult<{ token: string; expiresAt: Date; user: AuthUser; recoveryCodeUsed: boolean }>> {
  const verified = await verifyChallenge({ challenge: input.challenge, code: input.code });
  if (!verified.ok) {
    const code =
      verified.code === "invalid_code" || verified.code === "invalid_challenge"
        ? ("mfa_invalid_code" as const)
        : ("unknown" as const);
    return { ok: false, code, message: verified.message };
  }

  return privileged(async (tx) => {
    const rows = await tx.query<{
      id: string;
      email: string;
      full_name: string;
      avatar_url: string | null;
      email_verified_at: string | null;
      is_active: boolean;
    }>(
      `select id, email, full_name, avatar_url, email_verified_at, is_active
         from profiles where id = $1 and is_active`,
      [verified.data.userId],
    );
    const profile = rows[0];
    if (!profile) {
      return {
        ok: false as const,
        code: "inactive_account" as const,
        message: "Ce compte est désactivé. Contactez un administrateur.",
      };
    }

    const user = mapProfile(profile);

    // La 2FA franchie n'ouvre pas encore la session : le code OTP e-mail reste exigé —
    // sauf après une connexion Google (le jeton d'identité prouve déjà l'adresse),
    // à moins qu'AUTH_LOGIN_OTP_GOOGLE=true ne le rétablisse explicitement.
    const requireOtp = loginOtpEnabled() && (challengeVia(input.challenge) !== "google" || loginOtpGoogleEnabled());
    if (requireOtp) {
      const { challenge, previewCode } = await issueLoginChallenge(tx, user, input);
      return {
        ok: false as const,
        code: "login_otp_required" as const,
        message: "Saisissez le code à 6 chiffres qui vient d'être envoyé à votre adresse e-mail.",
        challenge,
        previewCode,
      };
    }

    const { token, expiresAt } = await createSession(tx, user.id, input);
    return {
      ok: true as const,
      data: {
        token,
        expiresAt,
        user,
        recoveryCodeUsed: verified.data.consumedRecoveryCode,
      },
    };
  });
}

/**
 * Troisième étape de connexion : vérifie le défi e-mail + le code à 6 chiffres,
 * puis ouvre la session. Défi à usage unique (10 minutes, 5 essais maximum) ;
 * le code n'est conservé qu'en empreinte scrypt.
 */
export async function completeLoginOtp(input: {
  challenge: string;
  code: string;
  ip: string | null;
  userAgent: string | null;
}): Promise<AuthResult<{ token: string; expiresAt: Date; user: AuthUser }>> {
  const code = input.code.trim();
  if (!/^\d{6}$/.test(code)) {
    return {
      ok: false,
      code: "login_otp_invalid",
      message: "Saisissez le code à 6 chiffres reçu par e-mail.",
    };
  }

  return privileged(async (tx) => {
    const rows = await tx.query<{
      id: string;
      user_id: string;
      expires_at: string;
      consumed_at: string | null;
      attempts: number;
      code_hash: string;
    }>(
      `select id, user_id, expires_at, consumed_at, attempts, code_hash
         from login_challenges where token_hash = $1`,
      [hashToken(input.challenge)],
    );
    const challenge = rows[0];
    if (
      !challenge ||
      challenge.consumed_at ||
      new Date(challenge.expires_at).getTime() <= Date.now() ||
      challenge.attempts >= LOGIN_OTP_MAX_ATTEMPTS
    ) {
      return {
        ok: false as const,
        code: "login_otp_invalid" as const,
        message: "Ce code a expiré. Reconnectez-vous pour recevoir un nouveau code.",
      };
    }

    const [algorithm, salt, hash] = challenge.code_hash.split("$");
    const valid =
      algorithm && salt && hash
        ? await verifyPassword(code, { hash, salt, algorithm })
        : false;

    if (!valid) {
      await tx.query("update login_challenges set attempts = attempts + 1 where id = $1", [
        challenge.id,
      ]);
      return {
        ok: false as const,
        code: "login_otp_invalid" as const,
        message: "Code incorrect. Vérifiez votre boîte mail et réessayez.",
      };
    }

    await tx.query("update login_challenges set consumed_at = now() where id = $1", [challenge.id]);

    const profiles = await tx.query<{
      id: string;
      email: string;
      full_name: string;
      avatar_url: string | null;
      email_verified_at: string | null;
      is_active: boolean;
    }>(
      `select id, email, full_name, avatar_url, email_verified_at, is_active
         from profiles where id = $1 and is_active`,
      [challenge.user_id],
    );
    const profile = profiles[0];
    if (!profile) {
      return {
        ok: false as const,
        code: "inactive_account" as const,
        message: "Ce compte est désactivé. Contactez un administrateur.",
      };
    }

    const { token, expiresAt } = await createSession(tx, profile.id, input);
    return { ok: true as const, data: { token, expiresAt, user: mapProfile(profile) } };
  });
}

export async function validateSession(token: string): Promise<SessionInfo | null> {
  const tokenHash = hashToken(token);
  return privileged(async (tx) => {
    const rows = await tx.query<{
      session_id: string;
      expires_at: string;
      id: string;
      email: string;
      full_name: string;
      avatar_url: string | null;
      email_verified_at: string | null;
      is_active: boolean;
    }>(
      `select s.id as session_id, s.expires_at,
              p.id, p.email, p.full_name, p.avatar_url, p.email_verified_at, p.is_active
       from sessions s
       join profiles p on p.id = s.user_id
       where s.token_hash = $1
         and s.revoked_at is null
         and s.expires_at > now()
         and p.is_active`,
      [tokenHash],
    );
    const row = rows[0];
    if (!row) return null;

    const expiresAt = new Date(row.expires_at);
    if (expiresAt.getTime() - Date.now() < SESSION_RENEW_THRESHOLD_MS) {
      const renewed = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);
      await tx.query("update sessions set expires_at = $2, last_used_at = now() where id = $1", [
        row.session_id,
        renewed,
      ]);
      await tx.query("update profiles set last_seen_at = now() where id = $1", [row.id]);
      return { user: mapProfile(row), expiresAt: renewed.toISOString() };
    }

    await tx.query("update sessions set last_used_at = now() where id = $1 and last_used_at < now() - interval '10 minutes'", [
      row.session_id,
    ]);
    return { user: mapProfile(row), expiresAt: expiresAt.toISOString() };
  });
}

export interface UserSessionRow {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

/** Sessions actives de l'utilisateur (la session courante est identifiée par son jeton). */
export async function listUserSessions(userId: string, currentToken?: string | null): Promise<UserSessionRow[]> {
  const currentHash = currentToken ? hashToken(currentToken) : null;
  return privileged(async (tx) => {
    const rows = await tx.query<{
      id: string;
      ip: string | null;
      user_agent: string | null;
      created_at: string;
      last_used_at: string;
      expires_at: string;
      token_hash: string;
    }>(
      `select id, ip, user_agent, created_at, last_used_at, expires_at, token_hash
       from sessions
       where user_id = $1 and revoked_at is null and expires_at > now()
       order by last_used_at desc`,
      [userId],
    );
    return rows.map((row) => ({
      id: row.id,
      ip: row.ip,
      userAgent: row.user_agent,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      expiresAt: row.expires_at,
      isCurrent: currentHash !== null && row.token_hash === currentHash,
    }));
  });
}

/** Révoque une session de l'utilisateur ; une session d'un autre utilisateur est ignorée. */
export async function revokeUserSessionById(userId: string, sessionId: string): Promise<boolean> {
  return privileged(async (tx) => {
    const rows = await tx.query<{ id: string }>(
      `update sessions set revoked_at = now()
       where id = $1 and user_id = $2 and revoked_at is null
       returning id`,
      [sessionId, userId],
    );
    return rows.length > 0;
  });
}

export async function revokeSession(token: string): Promise<void> {
  await privileged((tx) =>
    tx.query("update sessions set revoked_at = now() where token_hash = $1 and revoked_at is null", [
      hashToken(token),
    ]),
  );
}

export async function revokeAllUserSessions(userId: string, exceptToken?: string): Promise<void> {
  await privileged((tx) =>
    tx.query(
      `update sessions set revoked_at = now()
       where user_id = $1 and revoked_at is null and ($2::text is null or token_hash <> $2)`,
      [userId, exceptToken ? hashToken(exceptToken) : null],
    ),
  );
}

export async function requestPasswordReset(email: string): Promise<MailResult | null> {
  const user = await findUserByEmail(email);
  if (!user) return null; // Pas d'énumération de comptes : l'appelant renvoie toujours un succès.
  return privileged(async (tx) => {
    // Invalide les jetons précédents encore valides.
    await tx.query(
      `update verification_tokens set used_at = now()
       where user_id = $1 and purpose = 'password_reset' and used_at is null`,
      [user.id],
    );
    return issueToken(tx, user.id, "password_reset", RESET_TTL_MINUTES, user.email, user.fullName);
  });
}

export async function resetPasswordWithToken(
  token: string,
  newPassword: string,
): Promise<AuthResult<{ userId: string }>> {
  const credentials = await hashPassword(newPassword);
  return privileged(async (tx) => {
    const rows = await tx.query<{ id: string; user_id: string }>(
      `select id, user_id from verification_tokens
       where token_hash = $1 and purpose = 'password_reset' and used_at is null and expires_at > now()`,
      [hashToken(token)],
    );
    const row = rows[0];
    if (!row) {
      return {
        ok: false as const,
        code: "invalid_token" as const,
        message: "Ce lien de réinitialisation est invalide ou expiré.",
      };
    }
    await tx.query(
      `update user_credentials
       set password_hash = $2, password_salt = $3, algorithm = $4, password_updated_at = now()
       where user_id = $1`,
      [row.user_id, credentials.hash, credentials.salt, credentials.algorithm],
    );
    await tx.query("update verification_tokens set used_at = now() where id = $1", [row.id]);
    await tx.query(
      "update sessions set revoked_at = now() where user_id = $1 and revoked_at is null",
      [row.user_id],
    );
    return { ok: true as const, data: { userId: row.user_id } };
  });
}

export async function changePassword(input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<AuthResult<{ userId: string }>> {
  return privileged(async (tx) => {
    const rows = await tx.query<{ password_hash: string; password_salt: string; algorithm: string }>(
      "select password_hash, password_salt, algorithm from user_credentials where user_id = $1",
      [input.userId],
    );
    const row = rows[0];
    if (!row) {
      return {
        ok: false as const,
        code: "unknown" as const,
        message: "Aucun mot de passe n'est défini pour ce compte.",
      };
    }
    const valid = await verifyPassword(input.currentPassword, {
      hash: row.password_hash,
      salt: row.password_salt,
      algorithm: row.algorithm,
    });
    if (!valid) {
      return {
        ok: false as const,
        code: "invalid_credentials" as const,
        message: "Le mot de passe actuel est incorrect.",
      };
    }
    const next = await hashPassword(input.newPassword);
    await tx.query(
      `update user_credentials
       set password_hash = $2, password_salt = $3, algorithm = $4, password_updated_at = now()
       where user_id = $1`,
      [input.userId, next.hash, next.salt, next.algorithm],
    );
    return { ok: true as const, data: { userId: input.userId } };
  });
}

export async function setPasswordForUser(userId: string, newPassword: string): Promise<void> {
  const next = await hashPassword(newPassword);
  await privileged(async (tx) => {
    await tx.query(
      `insert into user_credentials (user_id, password_hash, password_salt, algorithm)
       values ($1, $2, $3, $4)
       on conflict (user_id) do update
       set password_hash = excluded.password_hash,
           password_salt = excluded.password_salt,
           algorithm = excluded.algorithm,
           password_updated_at = now()`,
      [userId, next.hash, next.salt, next.algorithm],
    );
  });
}

export async function cleanupExpiredAuthRecords(): Promise<void> {
  await privileged(async (tx) => {
    await tx.query("delete from sessions where expires_at < now() - interval '30 days'");
    await tx.query("delete from verification_tokens where expires_at < now() - interval '7 days'");
  });
}
