"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { privileged } from "@/lib/db";
import { requireUser } from "@/lib/server/context";
import { guard, success, type ActionResult } from "@/lib/server/action";
import { readSessionToken } from "@/lib/auth/cookies";
import { confirmEnrollment, disableMfa, startEnrollment } from "@/lib/auth/mfa";
import { recordAudit } from "@/lib/server/audit";

export async function startMfaEnrollmentAction(
  _state: ActionResult<unknown> | null,
  _formData: FormData,
): Promise<ActionResult<{ secret: string; uri: string }>> {
  return guard<{ secret: string; uri: string }>(async () => {
    const user = await requireUser();
    const result = await startEnrollment(user.id, user.email);
    if (!result.ok) {
      return { ok: false, code: result.code, message: result.message };
    }
    revalidatePath("/app/parametres/securite");
    return success(
      "Scannez ce secret dans votre application d'authentification, puis confirmez avec un code.",
      result.data,
    );
  });
}

export async function confirmMfaEnrollmentAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ recoveryCodes: string[] }>> {
  return guard<{ recoveryCodes: string[] }>(async () => {
    const user = await requireUser();
    const { code } = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Code à 6 chiffres attendu.") }).parse(
      Object.fromEntries(formData),
    );
    const result = await confirmEnrollment(user.id, code);
    if (!result.ok) {
      return { ok: false, code: result.code, message: result.message, fieldErrors: { code: result.message } };
    }
    await privileged((tx) =>
      recordAudit(tx, {
        organizationId: null,
        actorId: user.id,
        actorEmail: user.email,
        action: "auth.mfa.enable",
        entityType: "profile",
        entityId: user.id,
        summary: "Double authentification activée",
      }),
    );
    revalidatePath("/app/parametres/securite");
    return success(
      "Double authentification activée. Conservez vos codes de secours : ils ne seront plus affichés.",
      result.data,
    );
  });
}

export async function disableMfaAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ revokedSessions: number }>> {
  return guard<{ revokedSessions: number }>(async () => {
    const user = await requireUser();
    const { password } = z.object({ password: z.string().min(1, "Mot de passe requis.") }).parse(
      Object.fromEntries(formData),
    );
    const token = await readSessionToken();
    const result = await disableMfa(user.id, password, token);
    if (!result.ok) {
      return {
        ok: false,
        code: result.code,
        message: result.message,
        fieldErrors: { password: result.message },
      };
    }
    await privileged((tx) =>
      recordAudit(tx, {
        organizationId: null,
        actorId: user.id,
        actorEmail: user.email,
        action: "auth.mfa.disable",
        entityType: "profile",
        entityId: user.id,
        summary: `Double authentification désactivée (${result.data.revokedSessions} session(s) révoquée(s))`,
      }),
    );
    revalidatePath("/app/parametres/securite");
    return success(
      `Double authentification désactivée. ${result.data.revokedSessions} autre(s) session(s) ont été déconnectées.`,
    );
  });
}
