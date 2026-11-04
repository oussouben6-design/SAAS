import { describe, expect, it } from "vitest";
import { addMemberWithRole, createTestActor, contextOf } from "../helpers";
import { createCustomer } from "@/modules/crm/service";
import {
  addInvoiceItem,
  convertQuoteToInvoice,
  createExpense,
  createInvoice,
  createQuote,
  decideExpense,
  deleteExpense,
  deleteInvoice,
  getFinanceSummary,
  getInvoice,
  listInvoices,
  listRevenues,
  recordPayment,
  setInvoiceStatus,
  setQuoteStatus,
} from "@/modules/finance/service";
import { privileged } from "@/lib/db";

async function seedCustomer(context: { userId: string; organizationId: string }): Promise<string> {
  return createCustomer(context, {
    name: "Client Facturation SARL",
    email: "facturation@client.test",
    phone: null,
    website: null,
    address: null,
    city: "Niamey",
    country: "Niger",
    taxId: null,
    categoryId: null,
    status: "active",
    notes: null,
  });
}

describe("finances : factures et encaissements", () => {
  it("crée une facture numérotée, ajoute une ligne et recalcule les totaux", async () => {
    const actor = await createTestActor({ name: "Comptable" });
    const ctx = contextOf(actor);
    const customerId = await seedCustomer(ctx);

    const first = await createInvoice(ctx, {
      customerId,
      projectId: null,
      issueDate: "2026-03-01",
      dueDate: "2026-03-31",
      taxRate: 19,
      notes: null,
      terms: null,
      lineDescription: "Prestation de conseil",
      quantity: 2,
      unitPriceMinor: 500_000,
    });
    expect(first.number).toMatch(/^FAC-\d{4}-\d{4}$/);

    let detail = await getInvoice(ctx, first.id);
    expect(detail.invoice.subtotal_minor).toBe("1000000");
    expect(detail.invoice.tax_minor).toBe("190000");
    expect(detail.invoice.total_minor).toBe("1190000");
    expect(detail.invoice.status).toBe("draft");
    expect(detail.items).toHaveLength(1);

    await addInvoiceItem(ctx, {
      invoiceId: first.id,
      description: "Frais de déplacement",
      quantity: 1,
      unitPriceMinor: 100_000,
    });
    detail = await getInvoice(ctx, first.id);
    expect(detail.invoice.subtotal_minor).toBe("1100000");
    expect(detail.invoice.total_minor).toBe("1309000");

    // Le numéro reste unique même après plusieurs créations.
    const second = await createInvoice(ctx, {
      customerId,
      projectId: null,
      issueDate: "2026-03-02",
      dueDate: null,
      taxRate: 0,
      notes: null,
      terms: null,
      lineDescription: "Autre prestation",
      quantity: 1,
      unitPriceMinor: 50_000,
    });
    expect(second.number).not.toBe(first.number);
  });

  it("encaisse partiellement puis totalement, crée une recette et verrouille la facture", async () => {
    const actor = await createTestActor({ name: "Trésorier" });
    const ctx = contextOf(actor);
    const customerId = await seedCustomer(ctx);

    const invoice = await createInvoice(ctx, {
      customerId,
      projectId: null,
      issueDate: "2026-04-01",
      dueDate: "2026-04-30",
      taxRate: 0,
      notes: null,
      terms: null,
      lineDescription: "Mission",
      quantity: 1,
      unitPriceMinor: 1_000_000,
    });

    await setInvoiceStatus(ctx, { id: invoice.id, status: "sent" });

    await recordPayment(ctx, {
      invoiceId: invoice.id,
      amountMinor: 400_000,
      paidAt: "2026-04-10",
      method: "transfer",
      reference: "VIR-1",
      notes: null,
    });
    let detail = await getInvoice(ctx, invoice.id);
    expect(detail.invoice.status).toBe("partial");
    expect(detail.invoice.amount_paid_minor).toBe("400000");
    expect(detail.payments).toHaveLength(1);

    const revenues = await listRevenues(ctx, { pageSize: 10 });
    expect(revenues.items.some((revenue) => revenue.invoice_id === invoice.id)).toBe(true);

    // Un encaissement supérieur au solde restant est refusé.
    await expect(
      recordPayment(ctx, {
        invoiceId: invoice.id,
        amountMinor: 700_000,
        paidAt: "2026-04-11",
        method: "cash",
        reference: null,
        notes: null,
      }),
    ).rejects.toThrow(/solde restant/i);

    await recordPayment(ctx, {
      invoiceId: invoice.id,
      amountMinor: 600_000,
      paidAt: "2026-04-12",
      method: "mobile_money",
      reference: null,
      notes: null,
    });
    detail = await getInvoice(ctx, invoice.id);
    expect(detail.invoice.status).toBe("paid");
    expect(detail.invoice.amount_paid_minor).toBe("1000000");

    // Une facture payée ne peut plus être modifiée ni supprimée.
    await expect(
      addInvoiceItem(ctx, {
        invoiceId: invoice.id,
        description: "Ligne tardive",
        quantity: 1,
        unitPriceMinor: 10_000,
      }),
    ).rejects.toThrow(/payée ou annulée/i);
    await expect(deleteInvoice(ctx, invoice.id)).rejects.toThrow(/encaissements/i);
    await expect(
      setInvoiceStatus(ctx, { id: invoice.id, status: "draft" }),
    ).rejects.toThrow(/non autorisé/i);
  });

  it("refuse une transition de statut incohérente et calcule la synthèse", async () => {
    const actor = await createTestActor({ name: "Contrôleur" });
    const ctx = contextOf(actor);
    const customerId = await seedCustomer(ctx);

    const invoice = await createInvoice(ctx, {
      customerId,
      projectId: null,
      issueDate: "2026-05-01",
      dueDate: null,
      taxRate: 0,
      notes: null,
      terms: null,
      lineDescription: "Étude",
      quantity: 1,
      unitPriceMinor: 250_000,
    });

    await expect(
      setInvoiceStatus(ctx, { id: invoice.id, status: "paid" }),
    ).rejects.toThrow(/non autorisé/i);

    await setInvoiceStatus(ctx, { id: invoice.id, status: "sent" });
    const summary = await getFinanceSummary(ctx);
    expect(summary.currency).toBe("XOF");
    expect(summary.outstandingMinor).toBe("250000");

    const list = await listInvoices(ctx, { pageSize: 10 });
    expect(list.items[0]?.customer_name).toBe("Client Facturation SARL");
  });

  it("transforme un devis en facture brouillon une seule fois", async () => {
    const actor = await createTestActor({ name: "Commercial" });
    const ctx = contextOf(actor);
    const customerId = await seedCustomer(ctx);

    const quote = await createQuote(ctx, {
      customerId,
      subject: "Refonte du site",
      issueDate: "2026-06-01",
      validUntil: "2026-06-30",
      taxRate: 10,
      notes: null,
      terms: null,
      lineDescription: "Conception",
      quantity: 1,
      unitPriceMinor: 800_000,
    });
    expect(quote.number).toMatch(/^DEV-\d{4}-\d{4}$/);

    await setQuoteStatus(ctx, { id: quote.id, status: "accepted" });
    const invoice = await convertQuoteToInvoice(ctx, quote.id);
    expect(invoice.number).toMatch(/^FAC-/);

    const detail = await getInvoice(ctx, invoice.id);
    expect(detail.invoice.total_minor).toBe("880000");
    expect(detail.items).toHaveLength(1);

    await expect(convertQuoteToInvoice(ctx, quote.id)).rejects.toThrow(/déjà été facturé/i);
  });
});

describe("finances : dépenses et séparation des rôles", () => {
  it("crée une dépense en attente et interdit l'auto-validation", async () => {
    const actor = await createTestActor({ name: "Acheteur" });
    const ctx = contextOf(actor);

    await createExpense(ctx, {
      categoryId: null,
      label: "Achat de fournitures",
      amountMinor: 75_000,
      expenseDate: "2026-03-10",
      projectId: null,
      departmentId: null,
      supplier: "Fournisseur test",
      method: "cash",
      reference: null,
      notes: null,
    });

    const pending = await privileged((tx) =>
      tx.query<{ id: string; status: string }>(
        "select id, status from expenses where organization_id = $1",
        [actor.organizationId],
      ),
    );
    expect(pending[0]?.status).toBe("pending");

    await expect(
      decideExpense(ctx, { id: pending[0]!.id, decision: "approved", comment: null }),
    ).rejects.toThrow(/séparation des rôles/i);

    const director = await addMemberWithRole(actor.organizationId, "director");
    const directorCtx = { userId: director.userId, organizationId: actor.organizationId };
    await decideExpense(directorCtx, {
      id: pending[0]!.id,
      decision: "approved",
      comment: "Justificatif reçu",
    });

    const approved = await privileged((tx) =>
      tx.query<{ status: string; approved_by: string | null }>(
        "select status, approved_by from expenses where id = $1",
        [pending[0]!.id],
      ),
    );
    expect(approved[0]?.status).toBe("approved");
    expect(approved[0]?.approved_by).toBe(director.userId);

    await expect(deleteExpense(directorCtx, pending[0]!.id)).rejects.toThrow(/validée/i);
  });

  it("refuse un montant de dépense nul ou négatif", async () => {
    const actor = await createTestActor({ name: "Acheteur 2" });
    await expect(
      createExpense(contextOf(actor), {
        categoryId: null,
        label: "Dépense invalide",
        amountMinor: 0,
        expenseDate: "2026-03-10",
        projectId: null,
        departmentId: null,
        supplier: null,
        method: "cash",
        reference: null,
        notes: null,
      }),
    ).rejects.toThrow(/supérieur à zéro/i);
  });
});
