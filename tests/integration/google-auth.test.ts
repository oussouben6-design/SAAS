import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  authenticate,
  completeLoginOtp,
  completeMfaLogin,
  createUserAccount,
  findUserByEmail,
  getGoogleIdentitySummary,
  hasPasswordCredentials,
  loginOtpGoogleEnabled,
  signInWithGoogle,
  validateSession,
} from "@/lib/auth/service";
import { confirmEnrollment, startEnrollment } from "@/lib/auth/mfa";
import { totp } from "@/lib/auth/totp";
import { privileged } from "@/lib/db";

// Clé de chiffrement éphémère pour le scénario MFA (même convention que mfa.test.ts).
process.env.MFA_ENCRYPTION_KEY = randomBytes(32).toString("base64");

const PASSWORD = "MotDePasseSolide2026";
const META = { ip: "127.0.0.1", userAgent: "vitest" };
let counter = 0;

/** Exécute `run` avec des variables d'environnement temporaires, puis restaure. */
async function withEnv<T>(vars: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
  const previous = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await run();
  } finally {
    for (const k of Object.keys(vars)) {
      if (previous[k] === undefined) delete process.env[k];
      else process.env[k] = previous[k];
    }
  }
}

function googleProfile(overrides: Partial<Parameters<typeof signInWithGoogle>[0]> = {}) {
  counter += 1;
  return {
    subject: `google-sub-${counter}`,
    email: `google.${counter}@organix.test`,
    emailVerified: true,
    name: `Utilisatrice Google ${counter}`,
    ...overrides,
  };
}

describe("connexion avec Google", () => {
  it("crée un compte sans mot de passe et ouvre une session valide", async () => {
    const profile = googleProfile();
    const result = await signInWithGoogle(profile, META);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.accountCreated).toBe(true);
    expect(result.data.user.email).toBe(profile.email);
    expect(result.data.user.fullName).toBe(profile.name);
    expect(result.data.user.emailVerifiedAt).not.toBeNull();

    const session = await validateSession(result.data.token);
    expect(session?.user.id).toBe(result.data.user.id);

    // Aucun mot de passe : la connexion classique doit échouer proprement.
    expect(await hasPasswordCredentials(result.data.user.id)).toBe(false);
    const byPassword = await authenticate({ email: profile.email, password: PASSWORD, ...META });
    expect(byPassword).toMatchObject({ ok: false, code: "invalid_credentials" });

    const summary = await getGoogleIdentitySummary(result.data.user.id);
    expect(summary?.email).toBe(profile.email);
  });

  it("lie automatiquement un compte existant avec la même adresse e-mail", async () => {
    const created = await createUserAccount({
      email: "liaison@organix.test",
      fullName: "Compte Existant",
      password: PASSWORD,
      // emailVerified absent volontairement : Google doit marquer l'adresse vérifiée.
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data.user.emailVerifiedAt).toBeNull();

    const result = await signInWithGoogle(
      googleProfile({ email: "Liaison@Organix.test", subject: "google-sub-liaison" }),
      META,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.accountCreated).toBe(false);
    expect(result.data.user.id).toBe(created.data.user.id);
    expect(result.data.user.emailVerifiedAt).not.toBeNull();
    expect(await hasPasswordCredentials(created.data.user.id)).toBe(true);
  });

  it("retrouve le compte par l'identifiant Google même si l'e-mail a changé", async () => {
    const first = await signInWithGoogle(googleProfile({ subject: "google-sub-stable" }), META);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = await signInWithGoogle(
      googleProfile({ subject: "google-sub-stable", email: "nouvelle.adresse@organix.test" }),
      META,
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.accountCreated).toBe(false);
    expect(second.data.user.id).toBe(first.data.user.id);
    expect(await findUserByEmail("nouvelle.adresse@organix.test")).toBeNull();
  });

  it("refuse un compte désactivé", async () => {
    const profile = googleProfile();
    const first = await signInWithGoogle(profile, META);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    await privileged((tx) =>
      tx.query("update profiles set is_active = false where id = $1", [first.data.user.id]),
    );

    const result = await signInWithGoogle(profile, META);
    expect(result).toMatchObject({ ok: false, code: "inactive_account" });
  });

  it("respecte AUTH_ALLOW_REGISTRATION=false : pas de nouveau compte, comptes existants OK", async () => {
    const nouveau = googleProfile();
    const existant = await signInWithGoogle(googleProfile({ subject: "google-sub-ancien" }), META);
    expect(existant.ok).toBe(true);

    process.env.AUTH_ALLOW_REGISTRATION = "false";
    try {
      const refused = await signInWithGoogle(nouveau, META);
      expect(refused).toMatchObject({ ok: false, code: "registration_disabled" });
      expect(await findUserByEmail(nouveau.email)).toBeNull();

      const allowed = await signInWithGoogle(
        googleProfile({ subject: "google-sub-ancien" }),
        META,
      );
      expect(allowed.ok).toBe(true);
    } finally {
      delete process.env.AUTH_ALLOW_REGISTRATION;
    }
  });

  it("ouvre la session en un clic après Google (le code e-mail reste exigé pour le mot de passe)", async () => {
    await withEnv({ AUTH_LOGIN_OTP: "true", AUTH_LOGIN_OTP_GOOGLE: undefined }, async () => {
      expect(loginOtpGoogleEnabled()).toBe(false);
      const profile = googleProfile();
      const result = await signInWithGoogle(profile, META);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const session = await validateSession(result.data.token);
      expect(session?.user.id).toBe(result.data.user.id);
    });

    // Contrôle : avec AUTH_LOGIN_OTP=true, le mot de passe passe bien par le code e-mail.
    const user = await createUserAccount({
      email: "otp.controle@organix.test",
      fullName: "Compte Contrôle OTP",
      password: PASSWORD,
      emailVerified: true,
    });
    expect(user.ok).toBe(true);
    await withEnv({ AUTH_LOGIN_OTP: "true" }, async () => {
      const login = await authenticate({ email: "otp.controle@organix.test", password: PASSWORD, ...META });
      expect(login.ok).toBe(false);
      if (login.ok) return;
      expect(login.code).toBe("login_otp_required");
    });
  });

  it("AUTH_LOGIN_OTP_GOOGLE=true rétablit le code e-mail après Google", async () => {
    // Création du compte hors du bloc d'environnement (OTP e-mail forcé par ailleurs).
    const profile = googleProfile();
    const first = await signInWithGoogle(profile, META);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    await withEnv({ AUTH_LOGIN_OTP: "true", AUTH_LOGIN_OTP_GOOGLE: "true" }, async () => {
      const result = await signInWithGoogle(profile, META);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("login_otp_required");
      expect(result.previewCode).toMatch(/^\d{6}$/);

      const completed = await completeLoginOtp({
        challenge: result.challenge!,
        code: result.previewCode!,
        ...META,
      });
      expect(completed.ok).toBe(true);
      if (!completed.ok) return;
      const session = await validateSession(completed.data.token);
      expect(session?.user.id).toBe(first.data.user.id);
    });
  });

  it("après Google + 2FA : le TOTP est demandé puis la session s'ouvre sans code e-mail", async () => {
    const profile = googleProfile();
    const first = await signInWithGoogle(profile, META);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const enrollment = await startEnrollment(first.data.user.id, profile.email);
    expect(enrollment.ok).toBe(true);
    if (!enrollment.ok) return;
    const confirmation = await confirmEnrollment(first.data.user.id, totp(enrollment.data.secret));
    expect(confirmation.ok).toBe(true);

    await withEnv({ AUTH_LOGIN_OTP: "true", AUTH_LOGIN_OTP_GOOGLE: undefined }, async () => {
      const challenged = await signInWithGoogle(profile, META);
      expect(challenged).toMatchObject({ ok: false, code: "mfa_required" });
      if (challenged.ok || challenged.code !== "mfa_required") return;

      const completed = await completeMfaLogin({
        challenge: challenged.challenge!,
        code: totp(enrollment.data.secret),
        ...META,
      });
      expect(completed.ok).toBe(true);
      if (!completed.ok) return;
      const session = await validateSession(completed.data.token);
      expect(session?.user.id).toBe(first.data.user.id);
    });
  });

  it("après Google + 2FA avec AUTH_LOGIN_OTP_GOOGLE=true : TOTP puis code e-mail", async () => {
    const profile = googleProfile();
    const first = await signInWithGoogle(profile, META);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const enrollment = await startEnrollment(first.data.user.id, profile.email);
    expect(enrollment.ok).toBe(true);
    if (!enrollment.ok) return;
    const confirmation = await confirmEnrollment(first.data.user.id, totp(enrollment.data.secret));
    expect(confirmation.ok).toBe(true);

    await withEnv({ AUTH_LOGIN_OTP: "true", AUTH_LOGIN_OTP_GOOGLE: "true" }, async () => {
      const challenged = await signInWithGoogle(profile, META);
      expect(challenged).toMatchObject({ ok: false, code: "mfa_required" });
      if (challenged.ok || challenged.code !== "mfa_required") return;

      const afterMfa = await completeMfaLogin({
        challenge: challenged.challenge!,
        code: totp(enrollment.data.secret),
        ...META,
      });
      expect(afterMfa.ok).toBe(false);
      if (afterMfa.ok) return;
      expect(afterMfa.code).toBe("login_otp_required");

      const completed = await completeLoginOtp({
        challenge: afterMfa.challenge!,
        code: afterMfa.previewCode!,
        ...META,
      });
      expect(completed.ok).toBe(true);
    });
  });

  it("applique la double authentification après Google, comme après un mot de passe", async () => {
    const profile = googleProfile();
    const first = await signInWithGoogle(profile, META);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const enrollment = await startEnrollment(first.data.user.id, profile.email);
    expect(enrollment.ok).toBe(true);
    if (!enrollment.ok) return;
    const confirmation = await confirmEnrollment(first.data.user.id, totp(enrollment.data.secret));
    expect(confirmation.ok).toBe(true);

    const challenged = await signInWithGoogle(profile, META);
    expect(challenged).toMatchObject({ ok: false, code: "mfa_required" });
    if (challenged.ok || !challenged.challenge) return;

    const completed = await completeMfaLogin({
      challenge: challenged.challenge,
      code: totp(enrollment.data.secret),
      ...META,
    });
    expect(completed.ok).toBe(true);
    if (!completed.ok) return;
    const session = await validateSession(completed.data.token);
    expect(session?.user.id).toBe(first.data.user.id);
  });
});
