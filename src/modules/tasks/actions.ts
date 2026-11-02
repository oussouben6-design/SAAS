"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/server/context";
import { guard, success, type ActionResult } from "@/lib/server/action";
import { AppError } from "@/lib/server/errors";
import { requiredText, uuidSchema } from "@/lib/validation/common";
import { taskSchema, TASK_STATUSES } from "@/lib/validation/projects";
import {
  addComment,
  createTask,
  deleteComment,
  deleteTask,
  updateTask,
  updateTaskStatus,
} from "./service";

export async function createTaskAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("tasks", "create");
    const input = taskSchema.parse(Object.fromEntries(formData));
    const id = await createTask(
      { userId: context.user.id, organizationId: context.organization!.id },
      {
        title: input.title,
        description: input.description,
        projectId: input.projectId,
        parentTaskId: input.parentTaskId,
        assigneeId: input.assigneeId,
        status: input.status,
        priority: input.priority,
        dueDate: input.dueDate,
      },
    );
    revalidatePath("/app/taches");
    revalidatePath("/app");
    return success("Tâche créée.", { id });
  });
}

export async function updateTaskAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("tasks", "update");
    const input = taskSchema.parse(Object.fromEntries(formData));
    if (!input.id) throw new AppError("validation", "Identifiant de la tâche manquant.");
    await updateTask(
      { userId: context.user.id, organizationId: context.organization!.id },
      {
        id: input.id,
        title: input.title,
        description: input.description,
        projectId: input.projectId,
        assigneeId: input.assigneeId,
        status: input.status,
        priority: input.priority,
        dueDate: input.dueDate,
      },
    );
    revalidatePath("/app/taches");
    revalidatePath("/app");
    return success("Tâche mise à jour.");
  });
}

export async function updateTaskStatusAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("tasks", "update");
    const { id, status } = z
      .object({ id: uuidSchema, status: z.enum(TASK_STATUSES) })
      .parse(Object.fromEntries(formData));
    await updateTaskStatus(
      { userId: context.user.id, organizationId: context.organization!.id },
      { id, status },
    );
    revalidatePath("/app/taches");
    revalidatePath("/app");
    return success("Statut mis à jour.");
  });
}

export async function deleteTaskAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("tasks", "delete");
    const { id } = z.object({ id: uuidSchema }).parse(Object.fromEntries(formData));
    await deleteTask({ userId: context.user.id, organizationId: context.organization!.id }, id);
    revalidatePath("/app/taches");
    return success("Tâche supprimée.");
  });
}

export async function addCommentAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("tasks", "read");
    const input = z
      .object({ taskId: uuidSchema, body: requiredText("Commentaire", 1, 4000) })
      .parse(Object.fromEntries(formData));
    await addComment(
      { userId: context.user.id, organizationId: context.organization!.id },
      input,
    );
    revalidatePath("/app/taches");
    return success("Commentaire ajouté.");
  });
}

export async function deleteCommentAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("tasks", "read");
    const { id } = z.object({ id: uuidSchema }).parse(Object.fromEntries(formData));
    await deleteComment({ userId: context.user.id, organizationId: context.organization!.id }, id);
    revalidatePath("/app/taches");
    return success("Commentaire supprimé.");
  });
}
