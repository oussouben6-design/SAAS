import { describe, expect, it } from "vitest";
import {
  authenticate,
  changePassword,
  createUserAccount,
  requestPasswordReset,
  resetPasswordWithToken,
  listUserSessions,
  revokeAllUserSessions,
  revokeUserSessionById,
  validateSession,
  verifyEmailToken,
} from "@/lib/auth/service";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { privileged } from "@/lib/db";

const PASSWORD = "MotDePasseSolide2026";

describe("mots de passe", () => {
  it("ne stocke jamais le mot de passe en clair", async () => {
    const hashed = await hashPassword(PASSWORD);
    expect(hashed.hash).not.toContain(PASSWORD);
    expect(hashed.hash).toHaveLength(128);
    expect(hashed.salt).toHaveLength(32);
    expect(hashed.algorithm).toContain("scrypt");
  });

  it("vérifie correctement un mot de passe", async () => {
    const hashed = await hashPassword(PASSWORD);
    expect(await verifyPassword(PASSWORD, hashed)).toBe(true);
    expect(await verifyPassword(`${PASSWORD}x`, hashed)).toBe(false);
  });
});

describe("cycle de vie du compte", () => {
  it("crée un compte, connecte et valide la session", async () => {
    const created = await createUserAccount({
      email: "Test.Auth@Organix.test",
      fullName: "Test Auth",
      password: PASSWORD,
      emailVerified: true,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const login = await authenticate({
      email: "test.auth@organix.test",
      password: PASSWORD,
      ip: "127.0.0.1",
      userAgent: "vitest",
    });
    expect(login.ok).toBe(true);
    if (!login.ok) return;

    const session = await validateSession(login.data.token);
    expect(session?.user.id).toBe(created.data.user.id);
    expect(session?.user.email).toBe("test.auth@organix.test");
  });

  it("liste les sessions actives et permet d'en révoquer une", async () => {
    const created = await createUserAccount({
      email: "sessions@organix.test",
      fullName: "Sessions Multiples",
      password: PASSWORD,
      emailVerified: true,
    });
    if (!created.ok) throw new Error(created.message);

    const first = await authenticate({
      email: "sessions@organix.test",
      password: PASSWORD,
      ip: "10.0.0.1",
      userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120",
    });
    const second = await authenticate({
      email: "sessions@organix.test",
      password: PASSWORD,
      ip: "10.0.0.2",
      userAgent: "Mozilla/5.0 (iPhone) Safari/605",
    });
    if (!first.ok || !second.ok) throw new Error("connexion impossible");

    const sessions = await listUserSessions(created.data.user.id, second.data.token);
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((session) => session.isCurrent)).toHaveLength(1);
    expect(sessions.find((session) => session.isCurrent)?.ip).toBe("10.0.0.2");

    const other = sessions.find((session) => !session.isCurrent)!;
    expect(await revokeUserSessionById(created.data.user.id, other.id)).toBe(true);
    const afterRevoke = await listUserSessions(created.data.user.id, second.data.token);
    expect(afterRevoke).toHaveLength(1);
    expect(afterRevoke[0]?.isCurrent).toBe(true);

    // Le jeton révoqué ne permet plus de session valide.
    const revokedToken = other.ip === "10.0.0.1" ? first.data.token : second.data.token;
    expect(await validateSession(revokedToken)).toBeNull();

    // Un utilisateur ne peut pas révoquer la session d'un autre.
    const stranger = await createUserAccount({
      email: "intrus@organix.test",
      fullName: "Intrus Test",
      password: PASSWORD,
      emailVerified: true,
    });
    if (!stranger.ok) throw new Error(stranger.message);
    expect(await revokeUserSessionById(stranger.data.user.id, afterRevoke[0]!.id)).toBe(false);
  });

  it("refuse un mot de passe incorrect", async () => {
    await createUserAccount({
      email: "wrong@organix.test",
      fullName: "Wrong Password",
      password: PASSWORD,
      emailVerified: true,
    });
    const login = await authenticate({
      email: "wrong@organix.test",
      password: "MauvaisMotDePasse2026",
      ip: null,
      userAgent: null,
    });
    expect(login.ok).toBe(false);
    if (!login.ok) expect(login.code).toBe("invalid_credentials");
  });

  it("refuse un compte désactivé", async () => {
    const created = await createUserAccount({
      email: "inactive@organix.test",
      fullName: "Compte Inactif",
      password: PASSWORD,
      emailVerified: true,
    });
    if (!created.ok) throw new Error("création impossible");
    await privileged((tx) =>
      tx.query("update profiles set is_active = false where id = $1", [created.data.user.id]),
    );
    const login = await authenticate({
      email: "inactive@organix.test",
      password: PASSWORD,
      ip: null,
      userAgent: null,
    });
    expect(login.ok).toBe(false);
    if (!login.ok) expect(login.code).toBe("inactive_account");
  });

  it("interdit les doublons d'adresse e-mail (insensible à la casse)", async () => {
    await createUserAccount({
      email: "doublon@organix.test",
      fullName: "Premier",
      password: PASSWORD,
      emailVerified: true,
    });
    const second = await createUserAccount({
      email: "DOUBLON@organix.test",
      fullName: "Second",
      password: PASSWORD,
      emailVerified: true,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe("email_taken");
  });

  it("révoque les sessions après changement de mot de passe", async () => {
    const created = await createUserAccount({
      email: "session@organix.test",
      fullName: "Session Test",
      password: PASSWORD,
      emailVerified: true,
    });
    if (!created.ok) throw new Error("création impossible");

    const login = await authenticate({
      email: "session@organix.test",
      password: PASSWORD,
      ip: null,
      userAgent: null,
    });
    if (!login.ok) throw new Error("connexion impossible");
    expect(await validateSession(login.data.token)).not.toBeNull();

    const changed = await changePassword({
      userId: created.data.user.id,
      currentPassword: PASSWORD,
      newPassword: "NouveauMotDePasse2026",
    });
    expect(changed.ok).toBe(true);
    await revokeAllUserSessions(created.data.user.id);

    expect(await validateSession(login.data.token)).toBeNull();

    const relogin = await authenticate({
      email: "session@organix.test",
      password: "NouveauMotDePasse2026",
      ip: null,
      userAgent: null,
    });
    expect(relogin.ok).toBe(true);
  });

  it("refuse un jeton de session falsifié", async () => {
    expect(await validateSession("jeton-inexistant")).toBeNull();
  });
});

describe("réinitialisation et vérification", () => {
  it("génère un lien de réinitialisation et remplace le mot de passe", async () => {
    const created = await createUserAccount({
      email: "reset@organix.test",
      fullName: "Reset Test",
      password: PASSWORD,
      emailVerified: true,
    });
    if (!created.ok) throw new Error("création impossible");

    const mail = await requestPasswordReset("reset@organix.test");
    expect(mail?.previewUrl).toBeTruthy();
    const token = new URL(mail!.previewUrl!).searchParams.get("token")!;

    const reset = await resetPasswordWithToken(token, "MotDePasseReinitialise2026");
    expect(reset.ok).toBe(true);

    const oldLogin = await authenticate({
      email: "reset@organix.test",
      password: PASSWORD,
      ip: null,
      userAgent: null,
    });
    expect(oldLogin.ok).toBe(false);

    const newLogin = await authenticate({
      email: "reset@organix.test",
      password: "MotDePasseReinitialise2026",
      ip: null,
      userAgent: null,
    });
    expect(newLogin.ok).toBe(true);

    // Un jeton ne peut pas être réutilisé.
    const reuse = await resetPasswordWithToken(token, "AutreMotDePasse2026");
    expect(reuse.ok).toBe(false);
  });

  it("ne révèle pas l'existence d'un compte lors d'une demande de réinitialisation", async () => {
    expect(await requestPasswordReset("inconnu@organix.test")).toBeNull();
  });

  it("vérifie une adresse e-mail avec le jeton fourni", async () => {
    const created = await createUserAccount({
      email: "verify@organix.test",
      fullName: "Verify Test",
      password: PASSWORD,
    });
    if (!created.ok) throw new Error("création impossible");
    const url = created.data.verification?.previewUrl;
    expect(url).toBeTruthy();
    const token = new URL(url!).searchParams.get("token")!;

    const result = await verifyEmailToken(token);
    expect(result.ok).toBe(true);

    const reused = await verifyEmailToken(token);
    expect(reused.ok).toBe(false);
  });
});
