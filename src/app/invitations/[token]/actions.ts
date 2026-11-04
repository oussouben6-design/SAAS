"use server";

import { redirect } from "next/navigation";
import { acceptInvitation } from "@/modules/organization/invitations";
import { authenticate } from "@/lib/auth/service";
import { writeActiveOrgCookie, writeSessionCookie } from "@/lib/auth/cookies";
import { guard, success, type ActionResult } from "@/lib/server/action";
import { z } from "zod";
import { passwordSchema, requiredText } from "@/lib/validation/common";
import { headers } from "next/headers";

const acceptSchema = z.object({
  token: z.string().min(10, "Jeton invalide"),
  fullName: requiredText("Nom complet", 2, 120),
  password: passwordSchema,
});

export async function acceptInvitationAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const input = acceptSchema.parse(Object.fromEntries(formData));
    const accepted = await acceptInvitation(input.token, {
      fullName: input.fullName,
      password: input.password,
    });

    const headerList = await headers();
    const authenticated = await authenticate({
      email: accepted.email,
      password: input.password,
      ip: headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: headerList.get("user-agent")?.slice(0, 300) ?? null,
    });

    if (authenticated.ok) {
      await writeSessionCookie(authenticated.data.token, authenticated.data.expiresAt);
      await writeActiveOrgCookie(accepted.organizationId);
      redirect("/app");
    }

    return success("Compte activé. Connectez-vous pour accéder à votre organisation.");
  });
}
