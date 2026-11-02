"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/server/context";
import { guard, success, type ActionResult } from "@/lib/server/action";
import { createAnnouncement, createEvent, deleteAnnouncement, deleteEvent } from "./service";
import { announcementSchema, eventSchema } from "@/lib/validation/communication";

function ctx(context: Awaited<ReturnType<typeof requirePermission>>) {
  return { userId: context.user.id, organizationId: context.organization!.id };
}

export async function createAnnouncementAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("communication", "create");
    const input = announcementSchema.parse(Object.fromEntries(formData));
    await createAnnouncement(ctx(context), input);
    revalidatePath("/app/communication");
    revalidatePath("/app");
    return success("Annonce publiée.");
  });
}

export async function deleteAnnouncementAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("communication", "delete");
    const { id } = z.object({ id: z.string().uuid() }).parse(Object.fromEntries(formData));
    await deleteAnnouncement(ctx(context), id);
    revalidatePath("/app/communication");
    return success("Annonce supprimée.");
  });
}

export async function createEventAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("communication", "create");
    const input = eventSchema.parse(Object.fromEntries(formData));
    await createEvent(ctx(context), input);
    revalidatePath("/app/communication");
    revalidatePath("/app");
    return success("Événement ajouté au calendrier.");
  });
}

export async function deleteEventAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("communication", "delete");
    const { id } = z.object({ id: z.string().uuid() }).parse(Object.fromEntries(formData));
    await deleteEvent(ctx(context), id);
    revalidatePath("/app/communication");
    return success("Événement supprimé.");
  });
}
