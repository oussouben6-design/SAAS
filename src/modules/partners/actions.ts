"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/server/context";
import { guard, success, type ActionResult } from "@/lib/server/action";
import { AppError } from "@/lib/server/errors";
import {
  addAgreement,
  addPartnerContact,
  createPartner,
  deleteAgreement,
  deletePartner,
  deletePartnerContact,
  updatePartner,
} from "./service";
import { agreementSchema, partnerContactSchema, partnerSchema } from "@/lib/validation/partners";

function ctx(context: Awaited<ReturnType<typeof requirePermission>>) {
  return { userId: context.user.id, organizationId: context.organization!.id };
}

export async function createPartnerAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("partners", "create");
    const input = partnerSchema.parse(Object.fromEntries(formData));
    const id = await createPartner(ctx(context), {
      name: input.name,
      type: input.type,
      email: input.email,
      phone: input.phone,
      website: input.website,
      address: input.address,
      city: input.city,
      country: input.country,
      contactPerson: input.contactPerson,
      status: input.status,
      notes: input.notes,
    });
    revalidatePath("/app/partenaires");
    return success("Partenaire créé.", { id });
  });
}

export async function updatePartnerAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("partners", "update");
    const input = partnerSchema.parse(Object.fromEntries(formData));
    if (!input.id) throw new AppError("validation", "Identifiant du partenaire manquant.");
    await updatePartner(ctx(context), {
      id: input.id,
      name: input.name,
      type: input.type,
      email: input.email,
      phone: input.phone,
      website: input.website,
      address: input.address,
      city: input.city,
      country: input.country,
      contactPerson: input.contactPerson,
      status: input.status,
      notes: input.notes,
    });
    revalidatePath("/app/partenaires");
    revalidatePath(`/app/partenaires/${input.id}`);
    return success("Partenaire mis à jour.");
  });
}

export async function deletePartnerAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("partners", "delete");
    const { id } = z.object({ id: z.string().uuid() }).parse(Object.fromEntries(formData));
    await deletePartner(ctx(context), id);
    revalidatePath("/app/partenaires");
    redirect("/app/partenaires");
  });
}

export async function addPartnerContactAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("partners", "create");
    const input = partnerContactSchema.parse(Object.fromEntries(formData));
    await addPartnerContact(ctx(context), input);
    revalidatePath(`/app/partenaires/${input.partnerId}`);
    return success("Contact ajouté.");
  });
}

export async function deletePartnerContactAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("partners", "delete");
    const { partnerId, contactId } = z
      .object({ partnerId: z.string().uuid(), contactId: z.string().uuid() })
      .parse(Object.fromEntries(formData));
    await deletePartnerContact(ctx(context), { partnerId, contactId });
    revalidatePath(`/app/partenaires/${partnerId}`);
    return success("Contact supprimé.");
  });
}

export async function addAgreementAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("partners", "create");
    const input = agreementSchema.parse(Object.fromEntries(formData));
    await addAgreement(ctx(context), input);
    revalidatePath(`/app/partenaires/${input.partnerId}`);
    return success("Convention enregistrée.");
  });
}

export async function deleteAgreementAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("partners", "delete");
    const { partnerId, agreementId } = z
      .object({ partnerId: z.string().uuid(), agreementId: z.string().uuid() })
      .parse(Object.fromEntries(formData));
    await deleteAgreement(ctx(context), { partnerId, agreementId });
    revalidatePath(`/app/partenaires/${partnerId}`);
    return success("Convention supprimée.");
  });
}
