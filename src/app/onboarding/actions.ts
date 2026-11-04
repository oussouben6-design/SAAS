"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/server/context";
import { createOrganization } from "@/modules/organization/service";
import { writeActiveOrgCookie } from "@/lib/auth/cookies";
import { guard, type ActionResult } from "@/lib/server/action";
import { createOrganizationSchema } from "@/lib/validation/organization";

export async function createOrganizationAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const user = await requireUser();
    const input = createOrganizationSchema.parse(Object.fromEntries(formData));

    const created = await createOrganization({
      userId: user.id,
      userEmail: user.email,
      name: input.name,
      industry: input.industry,
      country: input.country,
      city: input.city,
      currency: input.currency,
      timezone: input.timezone,
      language: input.language,
    });

    await writeActiveOrgCookie(created.organizationId);
    redirect("/app");
  });
}
