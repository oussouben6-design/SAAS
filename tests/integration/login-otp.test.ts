import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  authenticate,
  completeLoginOtp,
  completeMfaLogin,
  createUserAccount,
  loginOtpEnabled,
  validateSession,
} from "@/lib/auth/service";
import { confirmEnrollment, startEnrollment } from "@/lib/auth/mfa";
import { totp } from "@/lib/auth/totp";
import { privileged } from "@/lib/db";

// Clé éphémère : la 2FA doit rester testable sans secret réel.
process.env.MFA_ENCRYPTION_KEY = randomBytes(32).toString("base64");

const PASSWORD = "MotDePasseSolide2026";
const META = { ip: "127.0.0.1", userAgent: "vitest" };
let counter = 0;

function withLoginOtp<T>(value: string | undefined, run: () => Promise<T>): Promise<T> {
  const previous = process.env.AUTH_LOGIN_OTP;
  if (value === undefined) delete process.env.AUTH_LOGIN_OTP;
  else process.env.AUTH_LOGIN_OTP = value;
  return run().finally(() => {
    if (previous === undefined) delete process.env.AUTH_LOGIN_OTP;
    else process.env.AUTH_LOGIN_OTP = previous;
  });
}

async function createUser(prefix = "otp") {
  counter += 1;
  const email = `${prefix}.${counter}@organix.test`;
  const created = await createUserAccount({
    email,
    fullName: `Utilisateur ${prefix} ${counter}`,
    password: PASSWORD,
    emailVerified: true,
  });
  if (!created.ok) throw new Error(created.message);
  return { id: created.data.user.id, email, fullName: `Utilisateur ${prefix} ${counter}` };
}

function wrongCode(correct: string): string {
  return correct === "000000" ? "111111" : "000000";
}

describe("code de connexion par e-mail (OTP)", () => {
  it("est actif par défaut et désactivable explicitement", async () => {
    await withLoginOtp(undefined, async () => {
      expect(loginOtpEnabled()).toBe(true);
    });
    await withLoginOtp("false", async () => {
      expect(loginOtpEnabled()).toBe(false);
    });
    await withLoginOtp("true", async () => {
      expect(loginOtpEnabled()).toBe(true);
    });
  });

  it("n'ouvre aucune session avec le mot de passe seul, puis ouvre la session après le code", async () => {
    const user = await createUser();
    await withLoginOtp("true", async () => {
      const login = await authenticate({ email: user.email, password: PASSWORD, ...META });
      expect(login.ok).toBe(false);
      if (login.ok) return;
      expect(login.code).toBe("login_otp_required");
      expect(login.challenge).toBeTruthy();
      // Transport console en développement : le code est renvoyé pour affichage.
      expect(login.previewCode).toMatch(/^\d{6}$/);

      const sessions = await privileged((tx) =>
        tx.query<{ count: number }>(
          `select count(*)::int as count from sessions s
             join profiles p on p.id = s.user_id where p.email = $1`,
          [user.email],
        ),
      );
      expect(sessions[0]?.count).toBe(0);

      // Mauvais code : refusé, le défi reste valide.
      const bad = await completeLoginOtp({
        challenge: login.challenge!,
        code: wrongCode(login.previewCode!),
        ...META,
      });
      expect(bad.ok).toBe(false);
      if (bad.ok) return;
      expect(bad.code).toBe("login_otp_invalid");

      // Bon code : session ouverte et jeton validable.
      const good = await completeLoginOtp({
        challenge: login.challenge!,
        code: login.previewCode!,
        ...META,
      });
      expect(good.ok).toBe(true);
      if (!good.ok) return;
      expect(good.data.user.email).toBe(user.email);
      const session = await validateSession(good.data.token);
      expect(session?.user.email).toBe(user.email);

      // Le défi est à usage unique.
      const replay = await completeLoginOtp({
        challenge: login.challenge!,
        code: login.previewCode!,
        ...META,
      });
      expect(replay.ok).toBe(false);
      if (!replay.ok) expect(replay.code).toBe("login_otp_invalid");
    });
  });

  it("ne stocke pas le code en clair en base", async () => {
    const user = await createUser("otphash");
    await withLoginOtp("true", async () => {
      const login = await authenticate({ email: user.email, password: PASSWORD, ...META });
      expect(login.ok).toBe(false);
      if (login.ok) return;

      const rows = await privileged((tx) =>
        tx.query<{ code_hash: string }>(
          "select code_hash from login_challenges where user_id = $1",
          [user.id],
        ),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.code_hash.startsWith("scrypt:")).toBe(true);
      expect(rows[0]?.code_hash).not.toContain(login.previewCode!);
    });
  });

  it("invalide le défi après 5 tentatives, même avec le bon code", async () => {
    const user = await createUser("otpbrute");
    await withLoginOtp("true", async () => {
      const login = await authenticate({ email: user.email, password: PASSWORD, ...META });
      expect(login.ok).toBe(false);
      if (login.ok) return;
      const bad = wrongCode(login.previewCode!);

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const result = await completeLoginOtp({ challenge: login.challenge!, code: bad, ...META });
        expect(result.ok).toBe(false);
      }
      const exhausted = await completeLoginOtp({
        challenge: login.challenge!,
        code: login.previewCode!,
        ...META,
      });
      expect(exhausted.ok).toBe(false);
      if (!exhausted.ok) expect(exhausted.code).toBe("login_otp_invalid");

      const sessions = await privileged((tx) =>
        tx.query<{ count: number }>(
          "select count(*)::int as count from sessions where user_id = $1",
          [user.id],
        ),
      );
      expect(sessions[0]?.count).toBe(0);
    });
  });

  it("exige le code e-mail même lorsque la 2FA TOTP est franchie", async () => {
    const user = await createUser("otp2fa");
    const enrollment = await startEnrollment(user.id, user.email);
    if (!enrollment.ok) throw new Error(enrollment.message);
    const confirmation = await confirmEnrollment(user.id, totp(enrollment.data.secret));
    if (!confirmation.ok) throw new Error(confirmation.message);

    await withLoginOtp("true", async () => {
      const login = await authenticate({ email: user.email, password: PASSWORD, ...META });
      expect(login.ok).toBe(false);
      if (login.ok) return;
      expect(login.code).toBe("mfa_required");

      // La 2FA seule n'ouvre pas la session : le code e-mail reste exigé.
      const afterMfa = await completeMfaLogin({
        challenge: login.challenge!,
        code: totp(enrollment.data.secret),
        ...META,
      });
      expect(afterMfa.ok).toBe(false);
      if (afterMfa.ok) return;
      expect(afterMfa.code).toBe("login_otp_required");
      expect(afterMfa.challenge).toBeTruthy();
      expect(afterMfa.previewCode).toMatch(/^\d{6}$/);

      const sessions = await privileged((tx) =>
        tx.query<{ count: number }>(
          "select count(*)::int as count from sessions where user_id = $1",
          [user.id],
        ),
      );
      expect(sessions[0]?.count).toBe(0);

      const done = await completeLoginOtp({
        challenge: afterMfa.challenge!,
        code: afterMfa.previewCode!,
        ...META,
      });
      expect(done.ok).toBe(true);
      if (!done.ok) return;
      const session = await validateSession(done.data.token);
      expect(session?.user.email).toBe(user.email);
    });
  });

  it("AUTH_LOGIN_OTP=false restaure la connexion en une étape (mot de passe seul)", async () => {
    const user = await createUser("otpoff");
    await withLoginOtp("false", async () => {
      const login = await authenticate({ email: user.email, password: PASSWORD, ...META });
      expect(login.ok).toBe(true);
      if (!login.ok) return;
      const session = await validateSession(login.data.token);
      expect(session?.user.email).toBe(user.email);
    });
  });
});
