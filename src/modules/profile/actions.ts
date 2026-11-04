"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/server/context";
import { asUser, privileged } from "@/lib/db";
import { guard, success, type ActionResult } from "@/lib/server/action";
import { changePasswordSchema, profileSchema, setInitialPasswordSchema } from "@/lib/validation/auth";
import {
  changePassword,
  hasPasswordCredentials,
  revokeAllUserSessions,
  revokeUserSessionById,
  sendEmailVerification,
  setPasswordForUser,
} from "@/lib/auth/service";
import { z } from "zod";
import { AppError } from "@/lib/server/errors";
import { readSessionToken } from "@/lib/auth/cookies";
import { recordAudit } from "@/lib/server/audit";

export async function updateProfileAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const user = await requireUser();
    const input = profileSchema.parse(Object.fromEntries(formData));
    await asUser(user.id, async (tx) => {
      await tx.query(
        "update profiles set full_name = $2, phone = $3, job_title = $4 where id = $1",
        [user.id, input.fullName, input.phone, input.jobTitle],
      );
    });
    revalidatePath("/app/parametres/profil");
    revalidatePath("/app", "layout");
    return success("Profil mis à jour.");
  });
}

export async function changePasswordAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const user = await requireUser();
    const input = changePasswordSchema.parse(Object.fromEntries(formData));
    const result = await changePassword({
      userId: user.id,
      currentPassword: input.currentPassword,
      newPassword: input.password,
    });
    if (!result.ok) {
      throw new AppError("validation", result.message, { currentPassword: result.message });
    }
    const token = await readSessionToken();
    await revokeAllUserSessions(user.id, token ?? undefined);
    await prettyAudit(user.id, user.email);
    return success("Mot de passe modifié. Les autres sessions ont été déconnectées.");
  });
}

/**
 * Définit le premier mot de passe d'un compte créé via Google.
 * L'utilisateur est déjà authentifié (session valide) ; refusé si un mot de
 * passe existe déjà — dans ce cas, seul le changement avec mot de passe actuel est accepté.
 */
export async function setInitialPasswordAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const user = await requireUser();
    const input = setInitialPasswordSchema.parse(Object.fromEntries(formData));
    if (await hasPasswordCredentials(user.id)) {
      throw new AppError(
        "validation",
        "Un mot de passe est déjà défini : utilisez le changement de mot de passe.",
      );
    }
    await setPasswordForUser(user.id, input.password);
    const token = await readSessionToken();
    await revokeAllUserSessions(user.id, token ?? undefined);
    await prettyAudit(user.id, user.email);
    return success("Mot de passe défini. Vous pouvez désormais aussi vous connecter par e-mail et mot de passe.");
  });
}

export async function revokeSessionAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const user = await requireUser();
    const { sessionId } = z.object({ sessionId: z.string().uuid() }).parse(Object.fromEntries(formData));
    const revoked = await revokeUserSessionById(user.id, sessionId);
    if (!revoked) throw new AppError("not_found", "Session introuvable ou déjà déconnectée.");
    await privileged((tx) =>
      recordAudit(tx, {
        organizationId: null,
        actorId: user.id,
        actorEmail: user.email,
        action: "auth.session.revoke",
        entityType: "session",
        entityId: sessionId,
        summary: "Déconnexion d'une session",
      }),
    );
    revalidatePath("/app/parametres/profil");
    return success("Session déconnectée.");
  });
}

export async function revokeOtherSessionsAction(
  _state: ActionResult<unknown> | null,
  _formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const user = await requireUser();
    const token = await readSessionToken();
    await revokeAllUserSessions(user.id, token ?? undefined);
    await privileged((tx) =>
      recordAudit(tx, {
        organizationId: null,
        actorId: user.id,
        actorEmail: user.email,
        action: "auth.session.revoke_others",
        entityType: "session",
        summary: "Déconnexion des autres sessions",
      }),
    );
    revalidatePath("/app/parametres/profil");
    return success("Les autres sessions ont été déconnectées.");
  });
}

async function prettyAudit(userId: string, email: string) {
  await privileged((tx) =>
    recordAudit(tx, {
      organizationId: null,
      actorId: userId,
      actorEmail: email,
      action: "auth.password.change",
      entityType: "profile",
      entityId: userId,
      summary: "Mot de passe modifié par l'utilisateur",
    }),
  );
}

export async function resendVerificationAction(
  _state: ActionResult<unknown> | null,
  _formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const user = await requireUser();
    const mail = await sendEmailVerification(user.id);
    return success(
      mail.previewUrl
        ? "Mode développement : aucun e-mail envoyé, utilisez le lien ci-dessous."
        : "Si votre adresse n'est pas vérifiée, un e-mail vous sera envoyé.",
      { previewUrl: mail.previewUrl ?? null, warning: mail.warning ?? null },
    );
  });
}
