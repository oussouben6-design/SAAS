"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/server/context";
import { guard, success, type ActionResult } from "@/lib/server/action";
import { AppError } from "@/lib/server/errors";
import { parseMoneyToMinor } from "@/lib/utils";
import {
  addContract,
  createEmployee,
  createLeaveRequest,
  decideLeaveRequest,
  deleteEmployee,
  recordAttendance,
  setEmployeeStatus,
  updateEmployee,
} from "./service";
import {
  attendanceSchema,
  contractSchema,
  employeeSchema,
  employeeStatusSchema,
  leaveDecisionSchema,
  leaveRequestSchema,
} from "@/lib/validation/hr";

function ctx(context: Awaited<ReturnType<typeof requirePermission>>) {
  return { userId: context.user.id, organizationId: context.organization!.id };
}

/** Salaire de référence : facultatif, 0 est accepté mais interprété comme « non renseigné ». */
function salaryMinor(value: string | undefined, currency: string): number | null {
  if (!value || value.trim() === "") return null;
  const minor = parseMoneyToMinor(value, currency);
  if (!Number.isFinite(minor) || minor < 0) {
    throw new AppError("validation", "Salaire invalide.");
  }
  return minor > 0 ? minor : null;
}

export async function createEmployeeAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("hr", "create");
    const input = employeeSchema.parse(Object.fromEntries(formData));
    const id = await createEmployee(ctx(context), {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      departmentId: input.departmentId,
      jobTitle: input.jobTitle,
      managerId: input.managerId,
      contractType: input.contractType,
      hireDate: input.hireDate,
      endDate: input.endDate,
      status: input.status,
      baseSalaryMinor: salaryMinor(input.baseSalary, context.organization?.currency ?? "XOF"),
      notes: input.notes,
    });
    revalidatePath("/app/rh");
    return success("Dossier employé créé.", { id });
  });
}

export async function updateEmployeeAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("hr", "update");
    const input = employeeSchema.parse(Object.fromEntries(formData));
    if (!input.id) throw new AppError("validation", "Identifiant de l'employé manquant.");
    await updateEmployee(ctx(context), {
      id: input.id,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      departmentId: input.departmentId,
      jobTitle: input.jobTitle,
      managerId: input.managerId,
      contractType: input.contractType,
      hireDate: input.hireDate,
      endDate: input.endDate,
      status: input.status,
      baseSalaryMinor: salaryMinor(input.baseSalary, context.organization?.currency ?? "XOF"),
      notes: input.notes,
    });
    revalidatePath("/app/rh");
    revalidatePath(`/app/rh/${input.id}`);
    return success("Dossier employé mis à jour.");
  });
}

export async function setEmployeeStatusAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("hr", "update");
    const input = employeeStatusSchema.parse(Object.fromEntries(formData));
    await setEmployeeStatus(ctx(context), input);
    revalidatePath("/app/rh");
    revalidatePath(`/app/rh/${input.id}`);
    return success("Statut mis à jour.");
  });
}

export async function deleteEmployeeAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("hr", "delete");
    const { id } = z.object({ id: z.string().uuid() }).parse(Object.fromEntries(formData));
    await deleteEmployee(ctx(context), id);
    revalidatePath("/app/rh");
    redirect("/app/rh");
  });
}

export async function addContractAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("hr", "create");
    const input = contractSchema.parse(Object.fromEntries(formData));
    await addContract(ctx(context), {
      employeeId: input.employeeId,
      reference: input.reference,
      type: input.type,
      startDate: input.startDate,
      endDate: input.endDate,
      salaryMinor: salaryMinor(input.salary, context.organization?.currency ?? "XOF"),
      signedAt: input.signedAt,
      notes: input.notes,
    });
    revalidatePath(`/app/rh/${input.employeeId}`);
    return success("Contrat enregistré.");
  });
}

export async function createLeaveRequestAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("hr", "create");
    const input = leaveRequestSchema.parse(Object.fromEntries(formData));
    await createLeaveRequest(ctx(context), input);
    revalidatePath("/app/rh");
    return success("Demande de congé enregistrée.");
  });
}

export async function decideLeaveRequestAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("hr", "validate");
    const input = leaveDecisionSchema.parse(Object.fromEntries(formData));
    await decideLeaveRequest(ctx(context), input);
    revalidatePath("/app/rh");
    return success(input.decision === "approved" ? "Congé approuvé." : "Congé refusé.");
  });
}

export async function recordAttendanceAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("hr", "update");
    const input = attendanceSchema.parse(Object.fromEntries(formData));
    await recordAttendance(ctx(context), input);
    revalidatePath("/app/rh");
    revalidatePath(`/app/rh/${input.employeeId}`);
    return success("Pointage enregistré.");
  });
}
