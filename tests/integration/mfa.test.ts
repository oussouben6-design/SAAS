import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  completeMfaLogin,
  authenticate,
  createUserAccount,
  validateSession,
} from "@/lib/auth/service";
import {
  confirmEnrollment,
  disableMfa,
  getMfaState,
  mfaAvailable,
  startEnrollment,
  verifyChallenge,
} from "@/lib/auth/mfa";
import { totp } from "@/lib/auth/totp";
import { privileged } from "@/lib/db";

// Clé de chiffrement éphémère : la fonctionnalité doit rester testable sans secret réel.
process.env.MFA_ENCRYPTION_KEY = randomBytes(32).toString("base64");

const PASSWORD = "MotDePasseSolide2026";
let counter = 0;

async function createUser(prefix = "mfa") {
  counter += 1;
  const email = `${prefix}.${counter}@organix.test`;
  const created = await createUserAccount({
    email,
    fullName: `Utilisateur ${prefix} ${counter}`,
    password: PASSWORD,
    emailVerified: true,
  });
  if (!created.ok) throw new Error(created.message);
  return { id: created.data.user.id, email };
}

async function enableMfa(userId: string, email: string) {
  const enrollment = await startEnrollment(userId, email);
  if (!enrollment.ok) throw new Error(enrollment.message);
  const confirmation = await confirmEnrollment(userId, totp(enrollment.data.secret));
  if (!confirmation.ok) throw new Error(confirmation.message);
  return { secret: enrollment.data.secret, recoveryCodes: confirmation.data.recoveryCodes };
}

describe("double authentification (TOTP)", () => {
  it("indique la disponibilité et refuse l'activation sans clé de chiffrement", async () => {
    expect(mfaAvailable()).toBe(true);
    const user = await createUser("mfakey");
    const previous = process.env.MFA_ENCRYPTION_KEY;
    delete process.env.MFA_ENCRYPTION_KEY;
    try {
      const attempt = await startEnrollment(user.id, user.email);
      expect(attempt.ok).toBe(false);
      if (!attempt.ok) expect(attempt.code).toBe("mfa_unavailable");
      const state = await getMfaState(user.id);
      expect(state.available).toBe(false);
      expect(state.enabled).toBe(false);
    } finally {
      process.env.MFA_ENCRYPTION_KEY = previous;
    }
  });

  it("chiffre le secret en base et l'active après un premier code valide", async () => {
    const user = await createUser();
    const enrollment = await startEnrollment(user.id, user.email);
    expect(enrollment.ok).toBe(true);
    if (!enrollment.ok) return;

    const rows = await privileged((tx) =>
      tx.query<{ secret_cipher: string }>("select secret_cipher from user_mfa where user_id = $1", [user.id]),
    );
    expect(rows[0]?.secret_cipher).toBeTruthy();
    expect(rows[0]?.secret_cipher).not.toContain(enrollment.data.secret);

    const wrong = await confirmEnrollment(user.id, "000000");
    expect(wrong.ok).toBe(false);

    const confirmation = await confirmEnrollment(user.id, totp(enrollment.data.secret));
    expect(confirmation.ok).toBe(true);
    if (!confirmation.ok) return;
    expect(confirmation.data.recoveryCodes).toHaveLength(10);

    const state = await getMfaState(user.id);
    expect(state.enabled).toBe(true);
    expect(state.recoveryCodesRemaining).toBe(10);
  });

  it("n'ouvre aucune session avec le mot de passe seul et exige le code", async () => {
    const user = await createUser();
    const { secret } = await enableMfa(user.id, user.email);

    const first = await authenticate({ email: user.email, password: PASSWORD, ip: "127.0.0.1", userAgent: "vitest" });
    expect(first.ok).toBe(false);
    if (first.ok) return;
    expect(first.code).toBe("mfa_required");
    expect(first.challenge).toBeTruthy();

    const sessions = await privileged((tx) =>
      tx.query<{ count: number }>(
        "select count(*)::int as count from sessions s join profiles p on p.id = s.user_id where p.email = $1",
        [user.email],
      ),
    );
    expect(sessions[0]?.count).toBe(0);

    const bad = await completeMfaLogin({ challenge: first.challenge!, code: "000000", ip: null, userAgent: "vitest" });
    expect(bad.ok).toBe(false);

    const good = await completeMfaLogin({ challenge: first.challenge!, code: totp(secret), ip: null, userAgent: "vitest" });
    expect(good.ok).toBe(true);
    if (!good.ok) return;
    expect(good.data.user.email).toBe(user.email);
    expect(good.data.recoveryCodeUsed).toBe(false);

    // Le défi est à usage unique.
    const replay = await verifyChallenge({ challenge: first.challenge!, code: totp(secret) });
    expect(replay.ok).toBe(false);
  });

  it("accepte un code de secours une seule fois", async () => {
    const user = await createUser("mfarecovery");
    const { recoveryCodes } = await enableMfa(user.id, user.email);

    const login = await authenticate({ email: user.email, password: PASSWORD, ip: null, userAgent: "vitest" });
    expect(login.ok).toBe(false);
    if (login.ok) return;

    const used = await completeMfaLogin({
      challenge: login.challenge!,
      code: recoveryCodes[0]!,
      ip: null,
      userAgent: "vitest",
    });
    expect(used.ok).toBe(true);
    if (!used.ok) return;
    expect(used.data.recoveryCodeUsed).toBe(true);
    expect((await getMfaState(user.id)).recoveryCodesRemaining).toBe(9);

    const second = await authenticate({ email: user.email, password: PASSWORD, ip: null, userAgent: "vitest" });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    const reused = await completeMfaLogin({
      challenge: second.challenge!,
      code: recoveryCodes[0]!,
      ip: null,
      userAgent: "vitest",
    });
    expect(reused.ok).toBe(false);
  });

  it("désactive la 2FA avec le mot de passe et révoque les autres sessions", async () => {
    const user = await createUser("mfadisable");
    const { secret } = await enableMfa(user.id, user.email);

    const first = await authenticate({ email: user.email, password: PASSWORD, ip: null, userAgent: "vitest" });
    expect(first.ok).toBe(false);
    if (first.ok) return;
    const login = await completeMfaLogin({ challenge: first.challenge!, code: totp(secret), ip: null, userAgent: "vitest" });
    expect(login.ok).toBe(true);
    if (!login.ok) return;

    const other = await authenticate({ email: user.email, password: PASSWORD, ip: null, userAgent: "autre" });
    expect(other.ok).toBe(false);
    if (other.ok) return;
    const otherLogin = await completeMfaLogin({ challenge: other.challenge!, code: totp(secret), ip: null, userAgent: "autre" });
    expect(otherLogin.ok).toBe(true);
    if (!otherLogin.ok) return;

    const wrongPassword = await disableMfa(user.id, "mauvais-mot-de-passe");
    expect(wrongPassword.ok).toBe(false);

    const disabled = await disableMfa(user.id, PASSWORD, login.data.token);
    expect(disabled.ok).toBe(true);
    if (!disabled.ok) return;
    expect(disabled.data.revokedSessions).toBe(1);
    expect((await getMfaState(user.id)).enabled).toBe(false);

    // La session courante survit ; l'autre est révoquée.
    expect(await validateSession(login.data.token)).not.toBeNull();
    expect(await validateSession(otherLogin.data.token)).toBeNull();

    const afterDisable = await authenticate({ email: user.email, password: PASSWORD, ip: null, userAgent: "vitest" });
    expect(afterDisable.ok).toBe(true);
  });
});
