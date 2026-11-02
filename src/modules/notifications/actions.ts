"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/server/context";
import { guard, success, type ActionResult } from "@/lib/server/action";
import { markAllRead, markNotificationRead } from "./service";
import { z } from "zod";
import { uuidSchema } from "@/lib/validation/common";

export async function markNotificationReadAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requireContext();
    const { id } = z.object({ id: uuidSchema }).parse(Object.fromEntries(formData));
    await markNotificationRead(
      { userId: context.user.id, organizationId: context.organization!.id },
      id,
    );
    revalidatePath("/app/notifications");
    revalidatePath("/app", "layout");
    return success("Notification marquée comme lue.");
  });
}

export async function markAllReadAction(
  _state: ActionResult<unknown> | null,
  _formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requireContext();
    await markAllRead({ userId: context.user.id, organizationId: context.organization!.id });
    revalidatePath("/app/notifications");
    revalidatePath("/app", "layout");
    return success("Toutes les notifications sont marquées comme lues.");
  });
}
