"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/server/context";
import { guard, success, type ActionResult } from "@/lib/server/action";
import { AppError } from "@/lib/server/errors";
import { uuidSchema } from "@/lib/validation/common";
import {
  departmentSchema,
  organizationSettingsSchema,
  toggleModuleSchema,
  updateMemberSchema,
} from "@/lib/validation/organization";
import { inviteMemberSchema } from "@/lib/validation/auth";
import {
  createDepartment,
  deleteDepartment,
  setMemberStatus,
  setModuleEnabled,
  updateDepartment,
  updateMember,
  updateOrganization,
  updateRolePermissions,
  removeMember,
} from "./service";
import { inviteMember } from "./invitations";

function ctx(context: Awaited<ReturnType<typeof requirePermission>>) {
  return { userId: context.user.id, organizationId: context.organization!.id };
}

export async function updateOrganizationAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("organization", "update");
    const input = organizationSettingsSchema.parse(Object.fromEntries(formData));
    await updateOrganization(ctx(context), input);
    revalidatePath("/app/parametres/organisation");
    revalidatePath("/app", "layout");
    return success("Paramètres de l'organisation enregistrés.");
  });
}

export async function createDepartmentAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("organization", "administer");
    const input = departmentSchema.parse(Object.fromEntries(formData));
    await createDepartment(ctx(context), input);
    revalidatePath("/app/parametres/equipe");
    return success("Département créé.");
  });
}

export async function updateDepartmentAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("organization", "administer");
    const input = z.object({ id: uuidSchema }).and(departmentSchema).parse(Object.fromEntries(formData));
    await updateDepartment(ctx(context), input);
    revalidatePath("/app/parametres/equipe");
    return success("Département mis à jour.");
  });
}

export async function deleteDepartmentAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("organization", "administer");
    const { id } = z.object({ id: uuidSchema }).parse(Object.fromEntries(formData));
    await deleteDepartment(ctx(context), id);
    revalidatePath("/app/parametres/equipe");
    return success("Département supprimé.");
  });
}

export async function inviteMemberAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("members", "create");
    const input = inviteMemberSchema.parse({
      ...Object.fromEntries(formData),
      roleKeys: formData.getAll("roleKeys").map(String),
    });
    if (input.roleKeys.length === 0) {
      throw new AppError("validation", "Sélectionnez au moins un rôle.", {
        roleKeys: "Sélectionnez au moins un rôle.",
      });
    }
    const result = await inviteMember(ctx(context), input);
    revalidatePath("/app/parametres/equipe");
    return success(
      result.mail.previewUrl
        ? "Invitation créée. Mode développement : le lien d'invitation est affiché ci-dessous."
        : "Invitation créée.",
      { previewUrl: result.mail.previewUrl ?? null, warning: result.mail.warning ?? null },
    );
  });
}

export async function updateMemberAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("members", "administer");
    const input = updateMemberSchema.parse({
      ...Object.fromEntries(formData),
      roleKeys: formData.getAll("roleKeys").map(String),
    });
    if (input.roleKeys.length === 0) {
      throw new AppError("validation", "Sélectionnez au moins un rôle.");
    }
    await updateMember(ctx(context), input);
    revalidatePath("/app/parametres/equipe");
    return success("Collaborateur mis à jour.");
  });
}

export async function setMemberStatusAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("members", "administer");
    const input = z
      .object({ memberId: uuidSchema, status: z.enum(["active", "suspended"]) })
      .parse(Object.fromEntries(formData));
    await setMemberStatus(ctx(context), input);
    revalidatePath("/app/parametres/equipe");
    return success("Statut du collaborateur mis à jour.");
  });
}

export async function removeMemberAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("members", "delete");
    const { memberId } = z.object({ memberId: uuidSchema }).parse(Object.fromEntries(formData));
    await removeMember(ctx(context), memberId);
    revalidatePath("/app/parametres/equipe");
    return success("Collaborateur retiré de l'organisation.");
  });
}

export async function updateRolePermissionsAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("roles", "administer");
    const roleId = uuidSchema.parse(formData.get("roleId"));
    const permissionKeys = formData.getAll("permissions").map(String);
    await updateRolePermissions(ctx(context), { roleId, permissionKeys });
    revalidatePath("/app/parametres/roles");
    return success("Permissions du rôle enregistrées.");
  });
}

export async function setModuleEnabledAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("organization", "administer");
    const input = toggleModuleSchema.parse({
      moduleKey: formData.get("moduleKey"),
      enabled: formData.get("enabled") === "true",
    });
    await setModuleEnabled(ctx(context), input);
    revalidatePath("/app/parametres/modules");
    revalidatePath("/app", "layout");
    return success("Module mis à jour.");
  });
}
