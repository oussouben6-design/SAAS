"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/server/context";
import { guard, success, type ActionResult } from "@/lib/server/action";
import { AppError } from "@/lib/server/errors";
import { parseMoneyToMinor } from "@/lib/utils";
import {
  addInvoiceItem,
  addQuoteItem,
  convertQuoteToInvoice,
  createExpense,
  createFinancialCategory,
  createInvoice,
  createQuote,
  createRevenue,
  decideExpense,
  deleteExpense,
  deleteInvoice,
  deleteInvoiceItem,
  deleteRevenue,
  recordPayment,
  setInvoiceStatus,
  setQuoteStatus,
  updateInvoiceMeta,
} from "./service";
import {
  expenseDecisionSchema,
  expenseSchema,
  financialCategorySchema,
  invoiceItemSchema,
  invoiceMetaSchema,
  invoiceSchema,
  invoiceStatusSchema,
  paymentSchema,
  quoteItemSchema,
  quoteSchema,
  quoteStatusSchema,
  revenueSchema,
} from "@/lib/validation/finance";

function ctx(context: Awaited<ReturnType<typeof requirePermission>>) {
  return { userId: context.user.id, organizationId: context.organization!.id };
}

function currencyOf(context: Awaited<ReturnType<typeof requirePermission>>): string {
  return context.organization?.currency ?? "XOF";
}

/** Convertit un montant saisi (« 1 250 000 ») en unité mineure de l'organisation. */
function toMinor(value: string, currency: string, allowZero = false): number {
  const minor = parseMoneyToMinor(value, currency);
  if (!Number.isFinite(minor) || (!allowZero && minor <= 0)) {
    throw new AppError("validation", "Montant invalide : saisissez un nombre positif.");
  }
  return minor;
}

export async function createInvoiceAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("finance", "create");
    const input = invoiceSchema.parse(Object.fromEntries(formData));
    const created = await createInvoice(ctx(context), {
      customerId: input.customerId,
      projectId: input.projectId,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      taxRate: input.taxRate,
      notes: input.notes,
      terms: input.terms,
      lineDescription: input.lineDescription,
      quantity: input.quantity,
      unitPriceMinor: toMinor(input.unitPrice, currencyOf(context)),
    });
    revalidatePath("/app/finances");
    revalidatePath("/app");
    return success(`Facture ${created.number} créée.`, created);
  });
}

export async function updateInvoiceAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("finance", "update");
    const input = invoiceMetaSchema.parse(Object.fromEntries(formData));
    await updateInvoiceMeta(ctx(context), {
      id: input.id,
      customerId: input.customerId,
      projectId: input.projectId,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      taxRate: input.taxRate,
      notes: input.notes,
      terms: input.terms,
    });
    revalidatePath("/app/finances");
    revalidatePath(`/app/finances/factures/${input.id}`);
    return success("Facture mise à jour.");
  });
}

export async function addInvoiceItemAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("finance", "update");
    const input = invoiceItemSchema.parse(Object.fromEntries(formData));
    await addInvoiceItem(ctx(context), {
      invoiceId: input.invoiceId,
      description: input.description,
      quantity: input.quantity,
      unitPriceMinor: toMinor(input.unitPrice, currencyOf(context), true),
    });
    revalidatePath(`/app/finances/factures/${input.invoiceId}`);
    return success("Ligne ajoutée.");
  });
}

export async function deleteInvoiceItemAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("finance", "update");
    const { invoiceId, itemId } = z
      .object({ invoiceId: z.string().uuid(), itemId: z.string().uuid() })
      .parse(Object.fromEntries(formData));
    await deleteInvoiceItem(ctx(context), { invoiceId, itemId });
    revalidatePath(`/app/finances/factures/${invoiceId}`);
    return success("Ligne supprimée.");
  });
}

export async function setInvoiceStatusAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("finance", "update");
    const input = invoiceStatusSchema.parse(Object.fromEntries(formData));
    await setInvoiceStatus(ctx(context), input);
    revalidatePath("/app/finances");
    revalidatePath(`/app/finances/factures/${input.id}`);
    return success("Statut de la facture mis à jour.");
  });
}

export async function recordPaymentAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("finance", "validate");
    const input = paymentSchema.parse(Object.fromEntries(formData));
    await recordPayment(ctx(context), {
      invoiceId: input.invoiceId,
      amountMinor: toMinor(input.amount, currencyOf(context)),
      paidAt: input.paidAt,
      method: input.method,
      reference: input.reference,
      notes: input.notes,
    });
    revalidatePath(`/app/finances/factures/${input.invoiceId}`);
    revalidatePath("/app/finances");
    revalidatePath("/app");
    return success("Encaissement enregistré.");
  });
}

export async function deleteInvoiceAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("finance", "delete");
    const { id } = z.object({ id: z.string().uuid() }).parse(Object.fromEntries(formData));
    await deleteInvoice(ctx(context), id);
    revalidatePath("/app/finances");
    redirect("/app/finances?vue=factures");
  });
}

export async function createQuoteAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("finance", "create");
    const input = quoteSchema.parse(Object.fromEntries(formData));
    const created = await createQuote(ctx(context), {
      customerId: input.customerId,
      subject: input.subject,
      issueDate: input.issueDate,
      validUntil: input.validUntil,
      taxRate: input.taxRate,
      notes: input.notes,
      terms: input.terms,
      lineDescription: input.lineDescription,
      quantity: input.quantity,
      unitPriceMinor: toMinor(input.unitPrice, currencyOf(context), true),
    });
    revalidatePath("/app/finances");
    return success(`Devis ${created.number} créé.`, created);
  });
}

export async function addQuoteItemAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("finance", "update");
    const input = quoteItemSchema.parse(Object.fromEntries(formData));
    await addQuoteItem(ctx(context), {
      quoteId: input.quoteId,
      description: input.description,
      quantity: input.quantity,
      unitPriceMinor: toMinor(input.unitPrice, currencyOf(context), true),
    });
    revalidatePath(`/app/finances/devis/${input.quoteId}`);
    return success("Ligne ajoutée.");
  });
}

export async function setQuoteStatusAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("finance", "update");
    const input = quoteStatusSchema.parse(Object.fromEntries(formData));
    await setQuoteStatus(ctx(context), input);
    revalidatePath("/app/finances");
    revalidatePath(`/app/finances/devis/${input.id}`);
    return success("Statut du devis mis à jour.");
  });
}

export async function convertQuoteAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("finance", "create");
    const { id } = z.object({ id: z.string().uuid() }).parse(Object.fromEntries(formData));
    const invoice = await convertQuoteToInvoice(ctx(context), id);
    revalidatePath("/app/finances");
    return success(`Devis facturé : ${invoice.number}.`, invoice);
  });
}

export async function createExpenseAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("finance", "create");
    const input = expenseSchema.parse(Object.fromEntries(formData));
    await createExpense(ctx(context), {
      categoryId: input.categoryId,
      label: input.label,
      amountMinor: toMinor(input.amount, currencyOf(context)),
      expenseDate: input.expenseDate,
      projectId: input.projectId,
      departmentId: input.departmentId,
      supplier: input.supplier,
      method: input.method,
      reference: input.reference,
      notes: input.notes,
    });
    revalidatePath("/app/finances");
    revalidatePath("/app");
    return success("Dépense enregistrée, en attente de validation.");
  });
}

export async function decideExpenseAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("finance", "validate");
    const input = expenseDecisionSchema.parse(Object.fromEntries(formData));
    await decideExpense(ctx(context), input);
    revalidatePath("/app/finances");
    revalidatePath("/app");
    return success(input.decision === "approved" ? "Dépense validée." : "Dépense refusée.");
  });
}

export async function deleteExpenseAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("finance", "delete");
    const { id } = z.object({ id: z.string().uuid() }).parse(Object.fromEntries(formData));
    await deleteExpense(ctx(context), id);
    revalidatePath("/app/finances");
    return success("Dépense supprimée.");
  });
}

export async function createRevenueAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("finance", "create");
    const input = revenueSchema.parse(Object.fromEntries(formData));
    await createRevenue(ctx(context), {
      categoryId: input.categoryId,
      label: input.label,
      amountMinor: toMinor(input.amount, currencyOf(context)),
      receivedAt: input.receivedAt,
      method: input.method,
      reference: input.reference,
      notes: input.notes,
    });
    revalidatePath("/app/finances");
    revalidatePath("/app");
    return success("Recette enregistrée.");
  });
}

export async function deleteRevenueAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("finance", "delete");
    const { id } = z.object({ id: z.string().uuid() }).parse(Object.fromEntries(formData));
    await deleteRevenue(ctx(context), id);
    revalidatePath("/app/finances");
    return success("Recette supprimée.");
  });
}

export async function createFinancialCategoryAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("finance", "update");
    const input = financialCategorySchema.parse(Object.fromEntries(formData));
    await createFinancialCategory(ctx(context), input);
    revalidatePath("/app/finances");
    return success("Catégorie créée.");
  });
}
