"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/server/context";
import { guard, success, type ActionResult } from "@/lib/server/action";
import { AppError } from "@/lib/server/errors";
import {
  addContact,
  addInteraction,
  createCategory,
  createCustomer,
  deleteContact,
  deleteCustomer,
  deleteInteraction,
  updateCustomer,
} from "./service";
import { categorySchema, contactSchema, customerSchema, interactionSchema } from "@/lib/validation/crm";
import { z } from "zod";

function ctx(context: Awaited<ReturnType<typeof requirePermission>>) {
  return { userId: context.user.id, organizationId: context.organization!.id };
}

export async function createCustomerAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("crm", "create");
    const input = customerSchema.parse(Object.fromEntries(formData));
    const id = await createCustomer(ctx(context), {
      name: input.name,
      email: input.email,
      phone: input.phone,
      website: input.website,
      address: input.address,
      city: input.city,
      country: input.country,
      taxId: input.taxId,
      categoryId: input.categoryId,
      status: input.status,
      notes: input.notes,
    });
    revalidatePath("/app/clients");
    revalidatePath("/app");
    return success("Client créé.", { id });
  });
}

export async function updateCustomerAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("crm", "update");
    const input = customerSchema.parse(Object.fromEntries(formData));
    if (!input.id) throw new AppError("validation", "Identifiant du client manquant.");
    await updateCustomer(ctx(context), {
      id: input.id,
      name: input.name,
      email: input.email,
      phone: input.phone,
      website: input.website,
      address: input.address,
      city: input.city,
      country: input.country,
      taxId: input.taxId,
      categoryId: input.categoryId,
      status: input.status,
      notes: input.notes,
    });
    revalidatePath("/app/clients");
    revalidatePath(`/app/clients/${input.id}`);
    return success("Client mis à jour.");
  });
}

export async function deleteCustomerAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("crm", "delete");
    const { id } = z.object({ id: z.string().uuid() }).parse(Object.fromEntries(formData));
    await deleteCustomer(ctx(context), id);
    revalidatePath("/app/clients");
    redirect("/app/clients");
  });
}

export async function addContactAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("crm", "create");
    const input = contactSchema.parse(Object.fromEntries(formData));
    await addContact(ctx(context), input);
    revalidatePath(`/app/clients/${input.customerId}`);
    return success("Contact ajouté.");
  });
}

export async function deleteContactAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("crm", "delete");
    const { id, customerId } = z
      .object({ id: z.string().uuid(), customerId: z.string().uuid() })
      .parse(Object.fromEntries(formData));
    await deleteContact(ctx(context), id);
    revalidatePath(`/app/clients/${customerId}`);
    return success("Contact supprimé.");
  });
}

export async function addInteractionAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("crm", "create");
    const input = interactionSchema.parse(Object.fromEntries(formData));
    await addInteraction(ctx(context), {
      customerId: input.customerId,
      type: input.type,
      subject: input.subject,
      notes: input.notes,
      occurredAt: input.occurredAt,
    });
    revalidatePath(`/app/clients/${input.customerId}`);
    return success("Échange enregistré.");
  });
}

export async function deleteInteractionAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("crm", "delete");
    const { id, customerId } = z
      .object({ id: z.string().uuid(), customerId: z.string().uuid() })
      .parse(Object.fromEntries(formData));
    await deleteInteraction(ctx(context), id);
    revalidatePath(`/app/clients/${customerId}`);
    return success("Échange supprimé.");
  });
}

export async function createCategoryAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("crm", "update");
    const input = categorySchema.parse(Object.fromEntries(formData));
    await createCategory(ctx(context), input);
    revalidatePath("/app/clients");
    return success("Catégorie créée.");
  });
}
