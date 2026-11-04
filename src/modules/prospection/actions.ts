"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/server/context";
import { guard, success, type ActionResult } from "@/lib/server/action";
import { AppError } from "@/lib/server/errors";
import {
  convertLeadToCustomer,
  createLead,
  createOpportunity,
  deleteLead,
  deleteOpportunity,
  moveOpportunity,
  updateLeadStatus,
} from "./service";
import { leadSchema } from "@/lib/validation/crm";
import { parseMoneyToMinor } from "@/lib/utils";
import { optionalText, requiredText, uuidSchema } from "@/lib/validation/common";

const opportunityFormSchema = z.object({
  name: requiredText("Nom de l'opportunité", 2, 160),
  customerId: optionalText(40),
  stageId: uuidSchema,
  amount: z.string().trim().min(1, "Montant requis"),
  expectedCloseDate: optionalText(10),
  notes: optionalText(4000),
});

export async function createLeadAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("prospection", "create");
    const input = leadSchema.parse(Object.fromEntries(formData));
    await createLead(
      { userId: context.user.id, organizationId: context.organization!.id },
      {
        name: input.name,
        company: input.company,
        email: input.email,
        phone: input.phone,
        source: input.source,
        status: input.status,
        notes: input.notes,
        nextFollowUpAt: input.nextFollowUpAt,
        ownerId: input.ownerId ?? context.user.id,
      },
    );
    revalidatePath("/app/prospection");
    return success("Prospect enregistré.");
  });
}

export async function updateLeadStatusAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("prospection", "update");
    const input = z
      .object({
        id: uuidSchema,
        status: z.enum(["new", "contacted", "qualified", "unqualified"]),
      })
      .parse(Object.fromEntries(formData));
    await updateLeadStatus(
      { userId: context.user.id, organizationId: context.organization!.id },
      input,
    );
    revalidatePath("/app/prospection");
    return success("Statut du prospect mis à jour.");
  });
}

export async function convertLeadAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("prospection", "update");
    const { id } = z.object({ id: uuidSchema }).parse(Object.fromEntries(formData));
    const result = await convertLeadToCustomer(
      { userId: context.user.id, organizationId: context.organization!.id },
      id,
    );
    revalidatePath("/app/prospection");
    revalidatePath("/app/clients");
    return success("Prospect converti en client.", { customerId: result.customerId });
  });
}

export async function deleteLeadAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("prospection", "delete");
    const { id } = z.object({ id: uuidSchema }).parse(Object.fromEntries(formData));
    await deleteLead(
      { userId: context.user.id, organizationId: context.organization!.id },
      id,
    );
    revalidatePath("/app/prospection");
    return success("Prospect supprimé.");
  });
}

export async function createOpportunityAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("prospection", "create");
    const input = opportunityFormSchema.parse(Object.fromEntries(formData));
    const currency = context.organization!.currency;
    const amountMinor = parseMoneyToMinor(input.amount, currency);
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      throw new AppError("validation", "Montant invalide.");
    }
    await createOpportunity(
      { userId: context.user.id, organizationId: context.organization!.id },
      {
        name: input.name,
        customerId: input.customerId,
        leadId: null,
        stageId: input.stageId,
        amountMinor,
        probability: 10,
        expectedCloseDate: input.expectedCloseDate,
        ownerId: context.user.id,
        notes: input.notes,
      },
    );
    revalidatePath("/app/prospection");
    return success("Opportunité créée.");
  });
}

export async function moveOpportunityAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("prospection", "update");
    const input = z
      .object({ id: uuidSchema, stageId: uuidSchema })
      .parse(Object.fromEntries(formData));
    await moveOpportunity(
      { userId: context.user.id, organizationId: context.organization!.id },
      input,
    );
    revalidatePath("/app/prospection");
    return success("Opportunité déplacée.");
  });
}

export async function deleteOpportunityAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("prospection", "delete");
    const { id } = z.object({ id: uuidSchema }).parse(Object.fromEntries(formData));
    await deleteOpportunity(
      { userId: context.user.id, organizationId: context.organization!.id },
      id,
    );
    revalidatePath("/app/prospection");
    return success("Opportunité supprimée.");
  });
}
