"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  authenticate,
  completeMfaLogin,
  createUserAccount,
  requestPasswordReset,
  resetPasswordWithToken,
  revokeSession,
} from "@/lib/auth/service";
import {
  clearActiveOrgCookie,
  clearMfaChallengeCookie,
  clearSessionCookie,
  readSessionToken,
  writeSessionCookie,
} from "@/lib/auth/cookies";
import { rateLimit } from "@/lib/rate-limit";
import { guard, failure, success, type ActionResult } from "@/lib/server/action";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validation/auth";
import { fieldErrors } from "@/lib/validation/common";
import { ZodError } from "zod";
import { listMemberships } from "@/lib/server/context";
import { AppError } from "@/lib/server/errors";

async function requestMeta() {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  return {
    ip: forwarded?.split(",")[0]?.trim() ?? headerList.get("x-real-ip") ?? null,
    userAgent: headerList.get("user-agent")?.slice(0, 300) ?? null,
  };
}

export async function loginAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ challenge: string }>> {
  return guard<{ challenge: string }>(async () => {
    const input = signInSchema.parse(Object.fromEntries(formData));
    const { ip, userAgent } = await requestMeta();

    const limit = rateLimit(`login:${input.email}:${ip ?? "local"}`, 10, 15 * 60);
    if (!limit.allowed) {
      throw new AppError(
        "rate_limited",
        `Trop de tentatives. Réessayez dans ${limit.retryAfterSeconds} secondes.`,
      );
    }

    const result = await authenticate({ ...input, ip, userAgent });
    if (!result.ok) {
      if (result.code === "mfa_required" && result.challenge) {
        return {
          ok: false as const,
          code: result.code,
          message: result.message,
          data: { challenge: result.challenge },
        };
      }
      return failure(result.message, result.code);
    }

    await writeSessionCookie(result.data.token, result.data.expiresAt);
    const memberships = await listMemberships(result.data.user.id);
    redirect(memberships.length === 0 ? "/onboarding" : "/app");
  });
}

export async function mfaLoginAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const challenge = String(formData.get("challenge") ?? "");
    const code = String(formData.get("code") ?? "");
    const { ip, userAgent } = await requestMeta();

    const limit = rateLimit(`mfa:${challenge || ip || "local"}`, 10, 15 * 60);
    if (!limit.allowed) {
      throw new AppError(
        "rate_limited",
        `Trop de tentatives. Réessayez dans ${limit.retryAfterSeconds} secondes.`,
      );
    }
    if (!challenge || !/^\d{6}$|^[A-Fa-f0-9]{5}-[A-Fa-f0-9]{5}$/.test(code.trim())) {
      return failure("Saisissez le code à 6 chiffres, ou un code de secours.", "mfa_invalid_code");
    }

    const result = await completeMfaLogin({ challenge, code, ip, userAgent });
    if (!result.ok) {
      return failure(result.message, result.code);
    }

    await clearMfaChallengeCookie();
    await writeSessionCookie(result.data.token, result.data.expiresAt);
    const memberships = await listMemberships(result.data.user.id);
    redirect(memberships.length === 0 ? "/onboarding" : "/app");
  });
}

/** Abandonne une double authentification en cours et revient au formulaire de connexion. */
export async function cancelMfaLoginAction(): Promise<void> {
  await clearMfaChallengeCookie();
  redirect("/connexion");
}

export async function registerAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    if (process.env.AUTH_ALLOW_REGISTRATION === "false") {
      throw new AppError(
        "forbidden",
        "La création de compte est désactivée. Demandez une invitation à votre administrateur.",
      );
    }

    const input = signUpSchema.parse(Object.fromEntries(formData));
    const { ip, userAgent } = await requestMeta();
    const limit = rateLimit(`register:${ip ?? "local"}`, 5, 60 * 60);
    if (!limit.allowed) {
      throw new AppError(
        "rate_limited",
        `Trop de créations de compte depuis cet appareil. Réessayez dans ${limit.retryAfterSeconds} secondes.`,
      );
    }

    const created = await createUserAccount({
      email: input.email,
      fullName: input.fullName,
      password: input.password,
    });
    if (!created.ok) return failure(created.message, created.code);

    const requireVerification = process.env.AUTH_REQUIRE_EMAIL_VERIFICATION === "true";
    if (requireVerification) {
      return success(
        "Compte créé. Vérifiez votre adresse e-mail pour activer la connexion.",
        { previewUrl: created.data.verification?.previewUrl ?? null },
      );
    }

    const authenticated = await authenticate({
      email: input.email,
      password: input.password,
      ip,
      userAgent,
    });
    if (!authenticated.ok) {
      return success("Compte créé. Vous pouvez maintenant vous connecter.");
    }
    await writeSessionCookie(authenticated.data.token, authenticated.data.expiresAt);
    redirect("/onboarding");
  });
}

export async function logoutAction(): Promise<void> {
  const token = await readSessionToken();
  if (token) await revokeSession(token);
  await clearSessionCookie();
  await clearActiveOrgCookie();
  revalidatePath("/", "layout");
  redirect("/connexion");
}

export async function forgotPasswordAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const input = forgotPasswordSchema.parse(Object.fromEntries(formData));
    const { ip } = await requestMeta();
    const limit = rateLimit(`forgot:${input.email}:${ip ?? "local"}`, 5, 60 * 60);
    if (!limit.allowed) {
      throw new AppError(
        "rate_limited",
        `Trop de demandes. Réessayez dans ${limit.retryAfterSeconds} secondes.`,
      );
    }

    const mail = await requestPasswordReset(input.email);
    return success(
      "Si un compte existe pour cette adresse, un lien de réinitialisation a été généré.",
      { previewUrl: mail?.previewUrl ?? null, warning: mail?.warning ?? null },
    );
  });
}

export async function resetPasswordAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    try {
      const input = resetPasswordSchema.parse(Object.fromEntries(formData));
      const result = await resetPasswordWithToken(input.token, input.password);
      if (!result.ok) return failure(result.message, result.code);
      return success("Mot de passe mis à jour. Vous pouvez vous connecter.");
    } catch (error) {
      if (error instanceof ZodError) {
        return failure("Certains champs sont invalides.", "validation", fieldErrors(error));
      }
      throw error;
    }
  });
}
