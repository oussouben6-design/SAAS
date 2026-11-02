import type { SqlExecutor } from "@/lib/db";
import { privileged } from "@/lib/db";
import { hashPassword, verifyPassword } from "./password";
import { generateToken, hashToken } from "./tokens";
import { appBaseUrl, sendMail, type MailResult } from "@/lib/mail";

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
  | "invalid_token"
  | "expired_token"
  | "weak_password"
  | "unknown";

export type AuthResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: AuthFailureCode; message: string };

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
        ? "ORGANIX — Vérifiez votre adresse e-mail"
        : purpose === "password_reset"
          ? "ORGANIX — Réinitialisation de votre mot de passe"
          : "ORGANIX — Invitation à rejoindre une organisation",
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

    const token = generateToken();
    const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);
    await tx.query(
      `insert into sessions (user_id, token_hash, ip, user_agent, expires_at)
       values ($1, $2, $3, $4, $5)`,
      [row.id, hashToken(token), input.ip, input.userAgent, expiresAt],
    );
    await tx.query("update profiles set last_seen_at = now() where id = $1", [row.id]);

    return {
      ok: true as const,
      data: { token, expiresAt, user: mapProfile(row) },
    };
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
