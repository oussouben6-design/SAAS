import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  authenticate,
  completeMfaLogin,
  createUserAccount,
  findUserByEmail,
  getGoogleIdentitySummary,
  hasPasswordCredentials,
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
