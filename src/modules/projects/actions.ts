"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/server/context";
import { guard, success, type ActionResult } from "@/lib/server/action";
import { parseMoneyToMinor } from "@/lib/utils";
import { uuidSchema } from "@/lib/validation/common";
import { milestoneSchema, projectMemberSchema, projectSchema } from "@/lib/validation/projects";
import {
  addMilestone,
  addProjectMember,
  createProject,
  deleteMilestone,
  deleteProject,
  removeProjectMember,
  toggleMilestone,
  updateProject,
} from "./service";
import { AppError } from "@/lib/server/errors";

function toInput(context: Awaited<ReturnType<typeof requirePermission>>, formData: FormData) {
  const parsed = projectSchema.parse(Object.fromEntries(formData));
  const currency = context.organization!.currency;
  return {
    ...parsed,
    budgetMinor: parsed.budget ? parseMoneyToMinor(parsed.budget, currency) : 0,
  };
}

export async function createProjectAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("projects", "create");
    const input = toInput(context, formData);
    const id = await createProject(
      { userId: context.user.id, organizationId: context.organization!.id },
      {
        name: input.name,
        code: input.code,
        description: input.description,
        objectives: input.objectives,
        customerId: input.customerId,
        departmentId: input.departmentId,
        managerId: input.managerId,
        status: input.status,
        priority: input.priority,
        startDate: input.startDate,
        endDate: input.endDate,
        budgetMinor: input.budgetMinor,
      },
    );
    revalidatePath("/app/projets");
    revalidatePath("/app");
    return success("Projet créé.", { id });
  });
}

export async function updateProjectAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("projects", "update");
    const input = toInput(context, formData);
    if (!input.id) throw new AppError("validation", "Identifiant du projet manquant.");
    await updateProject(
      { userId: context.user.id, organizationId: context.organization!.id },
      {
        id: input.id,
        name: input.name,
        code: input.code,
        description: input.description,
        objectives: input.objectives,
        customerId: input.customerId,
        departmentId: input.departmentId,
        managerId: input.managerId,
        status: input.status,
        priority: input.priority,
        startDate: input.startDate,
        endDate: input.endDate,
        budgetMinor: input.budgetMinor,
        progress: input.progress,
      },
    );
    revalidatePath("/app/projets");
    revalidatePath(`/app/projets/${input.id}`);
    return success("Projet mis à jour.");
  });
}

export async function deleteProjectAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("projects", "delete");
    const { id } = z.object({ id: uuidSchema }).parse(Object.fromEntries(formData));
    await deleteProject({ userId: context.user.id, organizationId: context.organization!.id }, id);
    revalidatePath("/app/projets");
    redirect("/app/projets");
  });
}

export async function addMilestoneAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("projects", "update");
    const input = milestoneSchema.parse(Object.fromEntries(formData));
    await addMilestone(
      { userId: context.user.id, organizationId: context.organization!.id },
      input,
    );
    revalidatePath(`/app/projets/${input.projectId}`);
    return success("Jalon ajouté.");
  });
}

export async function toggleMilestoneAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("projects", "update");
    const { id } = z
      .object({ id: uuidSchema, projectId: uuidSchema })
      .parse(Object.fromEntries(formData));
    const projectId = String(formData.get("projectId") ?? "");
    await toggleMilestone(
      { userId: context.user.id, organizationId: context.organization!.id },
      id,
    );
    revalidatePath(`/app/projets/${projectId}`);
    return success("Jalon mis à jour.");
  });
}

export async function deleteMilestoneAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("projects", "update");
    const { id } = z
      .object({ id: uuidSchema, projectId: uuidSchema })
      .parse(Object.fromEntries(formData));
    const projectId = String(formData.get("projectId") ?? "");
    await deleteMilestone(
      { userId: context.user.id, organizationId: context.organization!.id },
      id,
    );
    revalidatePath(`/app/projets/${projectId}`);
    return success("Jalon supprimé.");
  });
}

export async function addProjectMemberAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("projects", "update");
    const input = projectMemberSchema.parse(Object.fromEntries(formData));
    await addProjectMember(
      { userId: context.user.id, organizationId: context.organization!.id },
      input,
    );
    revalidatePath(`/app/projets/${input.projectId}`);
    return success("Membre ajouté au projet.");
  });
}

export async function removeProjectMemberAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("projects", "update");
    const { projectId, userId } = z
      .object({ projectId: uuidSchema, userId: uuidSchema })
      .parse(Object.fromEntries(formData));
    await removeProjectMember(
      { userId: context.user.id, organizationId: context.organization!.id },
      { projectId, userId },
    );
    revalidatePath(`/app/projets/${projectId}`);
    return success("Membre retiré.");
  });
}
