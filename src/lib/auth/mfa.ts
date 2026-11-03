import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { privileged } from "@/lib/db";
import { hashPassword, verifyPassword } from "./password";
import { generateToken, hashToken } from "./tokens";
import { generateTotpSecret, totpUri, verifyTotp } from "./totp";

/**
 * Double authentification (TOTP).
 *
 * - Le secret TOTP est chiffré en AES-256-GCM avec `MFA_ENCRYPTION_KEY` (32 octets base64).
 *   Sans clé, la fonctionnalité est explicitement indisponible : aucune activation silencieuse.
 * - Les codes de secours sont stockés hachés (scrypt), à usage unique.
 * - La connexion par mot de passe crée un jeton de défi (5 min, usage unique, 5 essais),
 *   jamais une session, lorsque la 2FA est confirmée.
 */

const CHALLENGE_TTL_MINUTES = 5;
const MAX_CHALLENGE_ATTEMPTS = 5;
const RECOVERY_CODE_COUNT = 10;

export type MfaResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: "mfa_unavailable" | "mfa_already_active" | "mfa_not_pending" | "invalid_code" | "mfa_not_active" | "invalid_challenge" | "invalid_credentials" | "unknown"; message: string };

function encryptionKey(): Buffer | null {
  const raw = process.env.MFA_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) return null;
  return key;
}

export function mfaAvailable(): boolean {
  return encryptionKey() !== null;
}

function encryptSecret(secret: string) {
  const key = encryptionKey();
  if (!key) throw new Error("MFA_ENCRYPTION_KEY absente ou invalide (32 octets base64 attendus).");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    cipher: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

function decryptSecret(row: { secret_cipher: string; secret_iv: string; secret_tag: string }): string {
  const key = encryptionKey();
  if (!key) throw new Error("MFA_ENCRYPTION_KEY absente : impossible de déchiffrer le secret.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(row.secret_iv, "base64"));
  decipher.setAuthTag(Buffer.from(row.secret_tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(row.secret_cipher, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export interface MfaState {
  available: boolean;
  enabled: boolean;
  pending: boolean;
  confirmedAt: string | null;
  lastUsedAt: string | null;
  recoveryCodesRemaining: number;
}

export async function getMfaState(userId: string): Promise<MfaState> {
  const available = mfaAvailable();
  const rows = await privileged((tx) =>
    tx.query<{
      confirmed_at: string | null;
      last_used_at: string | null;
      recovery_codes: string[] | null;
    }>(
      "select confirmed_at, last_used_at, recovery_codes from user_mfa where user_id = $1",
      [userId],
    ),
  );
  const row = rows[0];
  return {
    available,
    enabled: Boolean(row?.confirmed_at),
    pending: Boolean(row && !row.confirmed_at),
    confirmedAt: row?.confirmed_at ?? null,
    lastUsedAt: row?.last_used_at ?? null,
    recoveryCodesRemaining: row?.recovery_codes?.length ?? 0,
  };
}

/** Démarre (ou relance) une inscription : renvoie le secret une seule fois, avant confirmation. */
export async function startEnrollment(
  userId: string,
  email: string,
): Promise<MfaResult<{ secret: string; uri: string }>> {
  if (!mfaAvailable()) {
    return {
      ok: false,
      code: "mfa_unavailable",
      message:
        "Double authentification indisponible : la clé MFA_ENCRYPTION_KEY n'est pas configurée sur ce serveur.",
    };
  }
  const existing = await getMfaState(userId);
  if (existing.enabled) {
    return { ok: false, code: "mfa_already_active", message: "La double authentification est déjà activée." };
  }

  const secret = generateTotpSecret();
  const encrypted = encryptSecret(secret);
  await privileged((tx) =>
    tx.query(
      `insert into user_mfa (user_id, secret_cipher, secret_iv, secret_tag, confirmed_at, recovery_codes, failed_attempts)
       values ($1, $2, $3, $4, null, '{}', 0)
       on conflict (user_id) do update
         set secret_cipher = excluded.secret_cipher,
             secret_iv = excluded.secret_iv,
             secret_tag = excluded.secret_tag,
             confirmed_at = null,
             recovery_codes = '{}',
             failed_attempts = 0,
             updated_at = now()`,
      [userId, encrypted.cipher, encrypted.iv, encrypted.tag],
    ),
  );

  return { ok: true, data: { secret, uri: totpUri({ secret, account: email }) } };
}

function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () =>
    randomBytes(5).toString("hex").toUpperCase().replace(/(.{5})(.{5})/, "$1-$2"),
  );
}

/** Confirme l'inscription avec un premier code valide et renvoie les codes de secours (une seule fois). */
export async function confirmEnrollment(
  userId: string,
  code: string,
): Promise<MfaResult<{ recoveryCodes: string[] }>> {
  if (!mfaAvailable()) {
    return { ok: false, code: "mfa_unavailable", message: "Double authentification indisponible sur ce serveur." };
  }
  return privileged(async (tx) => {
    const rows = await tx.query<{ secret_cipher: string; secret_iv: string; secret_tag: string; confirmed_at: string | null }>(
      "select secret_cipher, secret_iv, secret_tag, confirmed_at from user_mfa where user_id = $1",
      [userId],
    );
    const row = rows[0];
    if (!row || row.confirmed_at) {
      return { ok: false as const, code: "mfa_not_pending" as const, message: "Aucune activation en attente." };
    }
    if (!verifyTotp(decryptSecret(row), code)) {
      await tx.query("update user_mfa set failed_attempts = failed_attempts + 1, updated_at = now() where user_id = $1", [userId]);
      return {
        ok: false as const,
        code: "invalid_code" as const,
        message: "Code invalide. Vérifiez l'heure de votre téléphone et réessayez.",
      };
    }

    const recoveryCodes = generateRecoveryCodes();
    const hashed = await Promise.all(recoveryCodes.map((value) => hashPassword(value)));
    await tx.query(
      `update user_mfa
          set confirmed_at = now(), recovery_codes = $2, failed_attempts = 0, last_used_at = now(), updated_at = now()
        where user_id = $1`,
      [userId, hashed.map((entry) => `${entry.algorithm}$${entry.salt}$${entry.hash}`)],
    );
    return { ok: true as const, data: { recoveryCodes } };
  });
}

export async function disableMfa(
  userId: string,
  password: string,
  keepSessionToken?: string | null,
): Promise<MfaResult<{ revokedSessions: number }>> {
  const credentials = await privileged((tx) =>
    tx.query<{ password_hash: string; password_salt: string; algorithm: string }>(
      "select password_hash, password_salt, algorithm from user_credentials where user_id = $1",
      [userId],
    ),
  );
  const stored = credentials[0];
  const valid = stored
    ? await verifyPassword(password, { hash: stored.password_hash, salt: stored.password_salt, algorithm: stored.algorithm })
    : false;
  if (!valid) {
    return { ok: false, code: "invalid_credentials", message: "Mot de passe incorrect." };
  }

  return privileged(async (tx) => {
    const deleted = await tx.query<{ user_id: string }>(
      "delete from user_mfa where user_id = $1 returning user_id",
      [userId],
    );
    if (deleted.length === 0) {
      return { ok: false as const, code: "mfa_not_active" as const, message: "La double authentification n'est pas activée." };
    }
    await tx.query("delete from mfa_challenges where user_id = $1", [userId]);
    // Les autres sessions sont révoquées : une désactivation ne doit pas laisser
    // d'accès ouvert si le mot de passe a été compromis.
    const revoked = await tx.query<{ id: string }>(
      `update sessions set revoked_at = now()
        where user_id = $1 and revoked_at is null and ($2::text is null or token_hash <> $2)
        returning id`,
      [userId, keepSessionToken ? hashToken(keepSessionToken) : null],
    );
    return { ok: true as const, data: { revokedSessions: revoked.length } };
  });
}

export interface ChallengeInfo {
  challenge: string;
  expiresAt: Date;
}

/** Crée un jeton de défi après validation du mot de passe (aucune session n'est ouverte). */
export async function createChallenge(input: {
  userId: string;
  ip: string | null;
  userAgent: string | null;
}): Promise<ChallengeInfo> {
  const challenge = generateToken(32);
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MINUTES * 60 * 1000);
  await privileged(async (tx) => {
    await tx.query("delete from mfa_challenges where user_id = $1 and (expires_at < now() or consumed_at is not null)", [
      input.userId,
    ]);
    await tx.query(
      `insert into mfa_challenges (user_id, token_hash, expires_at, ip, user_agent)
       values ($1, $2, $3, $4, $5)`,
      [input.userId, hashToken(challenge), expiresAt, input.ip, input.userAgent],
    );
  });
  return { challenge, expiresAt };
}

async function matchesRecoveryCode(
  code: string,
  stored: string[],
): Promise<{ index: number } | null> {
  const candidate = code.trim().toUpperCase().replace(/\s/g, "");
  for (const [index, entry] of stored.entries()) {
    const [algorithm, salt, hash] = entry.split("$");
    if (!algorithm || !salt || !hash) continue;
    if (await verifyPassword(candidate, { hash, salt, algorithm })) return { index };
  }
  return null;
}

/**
 * Vérifie le défi + code TOTP (ou code de secours) et renvoie l'utilisateur authentifié.
 * La création de session reste du ressort de `completeMfaLogin` dans le service d'authentification.
 */
export async function verifyChallenge(input: {
  challenge: string;
  code: string;
}): Promise<MfaResult<{ userId: string; expiresAt: Date; consumedRecoveryCode: boolean }>> {
  if (!mfaAvailable()) {
    return { ok: false, code: "mfa_unavailable", message: "Double authentification indisponible sur ce serveur." };
  }
  const code = input.code.trim();
  if (!code) return { ok: false, code: "invalid_code", message: "Saisissez votre code de vérification." };

  return privileged(async (tx) => {
    const rows = await tx.query<{
      id: string;
      user_id: string;
      expires_at: string;
      consumed_at: string | null;
      attempts: number;
    }>(
      `select id, user_id, expires_at, consumed_at, attempts
         from mfa_challenges where token_hash = $1`,
      [hashToken(input.challenge)],
    );
    const challenge = rows[0];
    if (
      !challenge ||
      challenge.consumed_at ||
      new Date(challenge.expires_at).getTime() <= Date.now() ||
      challenge.attempts >= MAX_CHALLENGE_ATTEMPTS
    ) {
      return {
        ok: false as const,
        code: "invalid_challenge" as const,
        message: "Session de vérification expirée. Reconnectez-vous.",
      };
    }

    const mfaRows = await tx.query<{
      secret_cipher: string;
      secret_iv: string;
      secret_tag: string;
      recovery_codes: string[] | null;
      confirmed_at: string | null;
    }>(
      "select secret_cipher, secret_iv, secret_tag, recovery_codes, confirmed_at from user_mfa where user_id = $1",
      [challenge.user_id],
    );
    const mfa = mfaRows[0];
    if (!mfa?.confirmed_at) {
      return { ok: false as const, code: "mfa_not_active" as const, message: "Double authentification non active." };
    }

    const totpValid = verifyTotp(decryptSecret(mfa), code);
    let recoveryIndex: number | null = null;
    if (!totpValid && /^[A-F0-9]{5}-[A-F0-9]{5}$/.test(code.toUpperCase())) {
      const match = await matchesRecoveryCode(code, mfa.recovery_codes ?? []);
      recoveryIndex = match ? match.index : null;
    }

    if (!totpValid && recoveryIndex === null) {
      await tx.query("update mfa_challenges set attempts = attempts + 1 where id = $1", [challenge.id]);
      return {
        ok: false as const,
        code: "invalid_code" as const,
        message: "Code invalide ou expiré. Réessayez.",
      };
    }

    if (recoveryIndex !== null) {
      const remaining = (mfa.recovery_codes ?? []).filter((_, index) => index !== recoveryIndex);
      await tx.query("update user_mfa set recovery_codes = $2, updated_at = now() where user_id = $1", [
        challenge.user_id,
        remaining,
      ]);
    }
    await tx.query("update user_mfa set last_used_at = now() where user_id = $1", [challenge.user_id]);
    await tx.query("update mfa_challenges set consumed_at = now() where id = $1", [challenge.id]);
    return {
      ok: true as const,
      data: {
        userId: challenge.user_id,
        expiresAt: new Date(Date.now() + 60_000),
        consumedRecoveryCode: recoveryIndex !== null,
      },
    };
  });
}
