import { asMember, type SqlExecutor } from "@/lib/db";
import { AppError } from "@/lib/server/errors";
import { recordAudit } from "@/lib/server/audit";

/**
 * Module Finances.
 *
 * Périmètre réel : facturation, encaissements, devis, dépenses et recettes.
 * Ce module n'est PAS une comptabilité certifiée : il ne produit ni balance, ni grand-livre,
 * ni déclaration fiscale. Les libellés de l'interface le rappellent explicitement.
 *
 * Tous les montants sont stockés en unité mineure (`bigint`), jamais en flottant.
 */

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function paginate<T>(items: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

async function organizationCurrency(tx: SqlExecutor, organizationId: string): Promise<string> {
  const rows = await tx.query<{ currency: string }>(
    "select currency from organizations where id = $1",
    [organizationId],
  );
  return rows[0]?.currency ?? "XOF";
}

/** Génère un numéro séquentiel unique par organisation et par exercice. */
async function nextNumber(
  tx: SqlExecutor,
  organizationId: string,
  table: "invoices" | "quotes",
  prefix: string,
): Promise<string> {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const rows = await tx.query<{ count: number }>(
      `select count(*)::int as count from ${table}
       where organization_id = $1 and number like $2`,
      [organizationId, `${prefix}-${year}-%`],
    );
    const sequence = (rows[0]?.count ?? 0) + 1 + attempt;
    const number = `${prefix}-${year}-${String(sequence).padStart(4, "0")}`;
    const existing = await tx.query<{ id: string }>(
      `select id from ${table} where organization_id = $1 and number = $2`,
      [organizationId, number],
    );
    if (existing.length === 0) return number;
  }
  throw new AppError("conflict", "Impossible de générer un numéro de pièce unique.");
}

async function recalculateInvoice(tx: SqlExecutor, invoiceId: string): Promise<void> {
  const totals = await tx.query<{ subtotal: string; tax_rate: string; paid: string; status: string }>(
    `select
       coalesce((select sum(amount_minor) from invoice_items where invoice_id = $1), 0)::text as subtotal,
       i.tax_rate::text as tax_rate,
       coalesce((select sum(amount_minor) from payments where invoice_id = $1), 0)::text as paid,
       i.status
     from invoices i where i.id = $1`,
    [invoiceId],
  );
  const row = totals[0];
  if (!row) return;
  const subtotal = Number(row.subtotal);
  const taxRate = Number(row.tax_rate);
  const tax = Math.round((subtotal * taxRate) / 100);
  const total = subtotal + tax;
  const paid = Number(row.paid);

  // Le statut est calculé en TypeScript pour éviter toute ambiguïté de typage
  // des paramètres dans la clause CASE (compatibilité PGlite / PostgreSQL).
  let status = row.status;
  if (status !== "draft" && status !== "cancelled") {
    if (total > 0 && paid >= total) status = "paid";
    else if (paid > 0) status = "partial";
  }

  await tx.query(
    `update invoices set subtotal_minor = $2::bigint, tax_minor = $3::bigint,
       total_minor = $4::bigint, amount_paid_minor = $5::bigint, status = $6
     where id = $1`,
    [invoiceId, subtotal, tax, total, paid, status],
  );
}

async function recalculateQuote(tx: SqlExecutor, quoteId: string): Promise<void> {
  const rows = await tx.query<{ subtotal: string; tax_rate: string }>(
    `select
       coalesce((select sum(amount_minor) from quote_items where quote_id = $1), 0)::text as subtotal,
       q.tax_rate::text as tax_rate
     from quotes q where q.id = $1`,
    [quoteId],
  );
  const row = rows[0];
  if (!row) return;
  const subtotal = Number(row.subtotal);
  const tax = Math.round((subtotal * Number(row.tax_rate)) / 100);
  await tx.query("update quotes set subtotal_minor = $2, total_minor = $3 where id = $1", [
    quoteId,
    subtotal,
    subtotal + tax,
  ]);
}

/* ------------------------------------------------------------------ Factures */

export interface InvoiceListItem {
  id: string;
  number: string;
  customer_id: string;
  customer_name: string;
  status: string;
  issue_date: string;
  due_date: string | null;
  currency: string;
  subtotal_minor: string;
  tax_minor: string;
  total_minor: string;
  amount_paid_minor: string;
}

export interface InvoiceItemRow {
  id: string;
  description: string;
  quantity: string;
  unit_price_minor: string;
  amount_minor: string;
}

export interface PaymentRow {
  id: string;
  amount_minor: string;
  paid_at: string;
  method: string;
  reference: string | null;
  notes: string | null;
  created_at: string;
}

export interface InvoiceDetail {
  invoice: InvoiceListItem & { notes: string | null; terms: string | null; project_id: string | null; quote_id: string | null };
  items: InvoiceItemRow[];
  payments: PaymentRow[];
  customer: { id: string; name: string; email: string | null; phone: string | null };
}

export interface InvoiceFilters {
  q?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface FinanceSummary {
  currency: string;
  invoicedMinor: string;
  paidMinor: string;
  outstandingMinor: string;
  overdueCount: number;
  draftCount: number;
  expensesMinor: string;
  revenuesMinor: string;
  pendingExpenses: number;
  balanceMinor: string;
}

export async function getFinanceSummary(context: {
  userId: string;
  organizationId: string;
}): Promise<FinanceSummary> {
  return asMember(context, async (tx) => {
    const currency = await organizationCurrency(tx, context.organizationId);
    const rows = await tx.query<{
      invoiced: string;
      paid: string;
      outstanding: string;
      overdue: number;
      drafts: number;
      expenses: string;
      revenues: string;
      pending_expenses: number;
    }>(
      `select
         coalesce((select sum(total_minor) from invoices
                   where organization_id = $1 and deleted_at is null and status <> 'cancelled'), 0)::text as invoiced,
         coalesce((select sum(amount_paid_minor) from invoices
                   where organization_id = $1 and deleted_at is null and status <> 'cancelled'), 0)::text as paid,
         coalesce((select sum(total_minor - amount_paid_minor) from invoices
                   where organization_id = $1 and deleted_at is null
                     and status in ('sent', 'partial', 'overdue')), 0)::text as outstanding,
         (select count(*)::int from invoices
          where organization_id = $1 and deleted_at is null and status = 'overdue') as overdue,
         (select count(*)::int from invoices
          where organization_id = $1 and deleted_at is null and status = 'draft') as drafts,
         coalesce((select sum(amount_minor) from expenses
                   where organization_id = $1 and deleted_at is null and status <> 'rejected'), 0)::text as expenses,
         coalesce((select sum(amount_minor) from revenues
                   where organization_id = $1 and deleted_at is null), 0)::text as revenues,
         (select count(*)::int from expenses
          where organization_id = $1 and deleted_at is null and status = 'pending') as pending_expenses`,
      [context.organizationId],
    );
    const row = rows[0]!;
    return {
      currency,
      invoicedMinor: row.invoiced,
      paidMinor: row.paid,
      outstandingMinor: row.outstanding,
      overdueCount: row.overdue,
      draftCount: row.drafts,
      expensesMinor: row.expenses,
      revenuesMinor: row.revenues,
      pendingExpenses: row.pending_expenses,
      balanceMinor: String(Number(row.revenues) - Number(row.expenses)),
    };
  });
}

export async function listInvoices(
  context: { userId: string; organizationId: string },
  filters: InvoiceFilters = {},
): Promise<Paginated<InvoiceListItem>> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 20));

  return asMember(context, async (tx) => {
    const values: unknown[] = [context.organizationId];
    const conditions: string[] = ["i.organization_id = $1", "i.deleted_at is null"];

    if (filters.status && filters.status !== "all") {
      values.push(filters.status);
      conditions.push(`i.status = $${values.length}`);
    }
    if (filters.q?.trim()) {
      values.push(`%${filters.q.trim()}%`);
      conditions.push(`(i.number ilike $${values.length} or c.name ilike $${values.length})`);
    }

    const where = conditions.join(" and ");
    const countRows = await tx.query<{ count: number }>(
      `select count(*)::int as count from invoices i
       join customers c on c.id = i.customer_id
       where ${where}`,
      values,
    );
    const total = countRows[0]?.count ?? 0;

    const rows = await tx.query<InvoiceListItem>(
      `select i.id, i.number, i.customer_id, c.name as customer_name, i.status, i.issue_date, i.due_date,
              i.currency, i.subtotal_minor::text, i.tax_minor::text, i.total_minor::text,
              i.amount_paid_minor::text
       from invoices i
       join customers c on c.id = i.customer_id
       where ${where}
       order by i.issue_date desc, i.number desc
       limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, pageSize, (page - 1) * pageSize],
    );

    return paginate(rows, total, page, pageSize);
  });
}

export async function getInvoice(
  context: { userId: string; organizationId: string },
  invoiceId: string,
): Promise<InvoiceDetail> {
  return asMember(context, async (tx) => {
    const rows = await tx.query<InvoiceDetail["invoice"] & { customer_email: string | null; customer_phone: string | null }>(
      `select i.id, i.number, i.customer_id, c.name as customer_name, i.status, i.issue_date, i.due_date,
              i.currency, i.subtotal_minor::text, i.tax_minor::text, i.total_minor::text,
              i.amount_paid_minor::text, i.notes, i.terms, i.project_id, i.quote_id,
              c.email as customer_email, c.phone as customer_phone
       from invoices i join customers c on c.id = i.customer_id
       where i.id = $1 and i.organization_id = $2 and i.deleted_at is null`,
      [invoiceId, context.organizationId],
    );
    const invoice = rows[0];
    if (!invoice) throw new AppError("not_found", "Facture introuvable.");

    const items = await tx.query<InvoiceItemRow>(
      `select id, description, quantity::text, unit_price_minor::text, amount_minor::text
       from invoice_items where invoice_id = $1 order by position, id`,
      [invoiceId],
    );
    const payments = await tx.query<PaymentRow>(
      `select id, amount_minor::text, paid_at, method, reference, notes, created_at
       from payments where invoice_id = $1 order by paid_at desc, created_at desc`,
      [invoiceId],
    );

    return {
      invoice,
      items,
      payments,
      customer: {
        id: invoice.customer_id,
        name: invoice.customer_name,
        email: invoice.customer_email,
        phone: invoice.customer_phone,
      },
    };
  });
}

export interface InvoiceInput {
  customerId: string;
  projectId: string | null;
  issueDate: string;
  dueDate: string | null;
  taxRate: number;
  notes: string | null;
  terms: string | null;
  lineDescription: string;
  quantity: number;
  unitPriceMinor: number;
}

export async function createInvoice(
  context: { userId: string; organizationId: string },
  input: InvoiceInput,
): Promise<{ id: string; number: string }> {
  return asMember(context, async (tx) => {
    const currency = await organizationCurrency(tx, context.organizationId);
    const number = await nextNumber(tx, context.organizationId, "invoices", "FAC");
    const amount = Math.round(input.quantity * input.unitPriceMinor);
    const tax = Math.round((amount * input.taxRate) / 100);

    const rows = await tx.query<{ id: string }>(
      `insert into invoices
        (organization_id, number, customer_id, project_id, status, issue_date, due_date, currency,
         subtotal_minor, tax_rate, tax_minor, total_minor, amount_paid_minor, notes, terms, created_by)
       values ($1, $2, $3, $4, 'draft', $5, $6, $7, $8, $9, $10, $11, 0, $12, $13, $14)
       returning id`,
      [
        context.organizationId,
        number,
        input.customerId,
        input.projectId,
        input.issueDate,
        input.dueDate,
        currency,
        amount,
        input.taxRate,
        tax,
        amount + tax,
        input.notes,
        input.terms,
        context.userId,
      ],
    );
    const invoiceId = rows[0]!.id;

    await tx.query(
      `insert into invoice_items (invoice_id, description, quantity, unit_price_minor, amount_minor, position)
       values ($1, $2, $3, $4, $5, 10)`,
      [invoiceId, input.lineDescription, input.quantity, input.unitPriceMinor, amount],
    );

    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "invoice.create",
      entityType: "invoice",
      entityId: invoiceId,
      summary: `Création de la facture ${number}`,
      metadata: { totalMinor: amount + tax, currency },
    });

    return { id: invoiceId, number };
  });
}

export async function updateInvoiceMeta(
  context: { userId: string; organizationId: string },
  input: {
    id: string;
    customerId: string;
    projectId: string | null;
    issueDate: string;
    dueDate: string | null;
    taxRate: number;
    notes: string | null;
    terms: string | null;
  },
): Promise<void> {
  await asMember(context, async (tx) => {
    const existing = await tx.query<{ status: string; number: string }>(
      "select status, number from invoices where id = $1 and organization_id = $2 and deleted_at is null",
      [input.id, context.organizationId],
    );
    const invoice = existing[0];
    if (!invoice) throw new AppError("not_found", "Facture introuvable.");
    if (["paid", "cancelled"].includes(invoice.status)) {
      throw new AppError("conflict", "Une facture payée ou annulée ne peut plus être modifiée.");
    }

    await tx.query(
      `update invoices set customer_id = $2, project_id = $3, issue_date = $4, due_date = $5,
         tax_rate = $6, notes = $7, terms = $8
       where id = $1 and organization_id = $9`,
      [
        input.id,
        input.customerId,
        input.projectId,
        input.issueDate,
        input.dueDate,
        input.taxRate,
        input.notes,
        input.terms,
        context.organizationId,
      ],
    );
    await recalculateInvoice(tx, input.id);

    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "invoice.update",
      entityType: "invoice",
      entityId: input.id,
      summary: `Mise à jour de la facture ${invoice.number}`,
    });
  });
}

export async function addInvoiceItem(
  context: { userId: string; organizationId: string },
  input: { invoiceId: string; description: string; quantity: number; unitPriceMinor: number },
): Promise<void> {
  await asMember(context, async (tx) => {
    const rows = await tx.query<{ status: string; number: string }>(
      "select status, number from invoices where id = $1 and organization_id = $2 and deleted_at is null",
      [input.invoiceId, context.organizationId],
    );
    const invoice = rows[0];
    if (!invoice) throw new AppError("not_found", "Facture introuvable.");
    if (["paid", "cancelled"].includes(invoice.status)) {
      throw new AppError("conflict", "Une facture payée ou annulée ne peut plus être modifiée.");
    }

    const position = await tx.query<{ next: number }>(
      "select coalesce(max(position), 0) + 10 as next from invoice_items where invoice_id = $1",
      [input.invoiceId],
    );
    const amount = Math.round(input.quantity * input.unitPriceMinor);
    await tx.query(
      `insert into invoice_items (invoice_id, description, quantity, unit_price_minor, amount_minor, position)
       values ($1, $2, $3, $4, $5, $6)`,
      [input.invoiceId, input.description, input.quantity, input.unitPriceMinor, amount, position[0]?.next ?? 10],
    );
    await recalculateInvoice(tx, input.invoiceId);

    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "invoice.item.add",
      entityType: "invoice",
      entityId: input.invoiceId,
      summary: `Ajout d'une ligne à la facture ${invoice.number}`,
      metadata: { amountMinor: amount },
    });
  });
}

export async function deleteInvoiceItem(
  context: { userId: string; organizationId: string },
  input: { invoiceId: string; itemId: string },
): Promise<void> {
  await asMember(context, async (tx) => {
    const rows = await tx.query<{ status: string; number: string }>(
      "select status, number from invoices where id = $1 and organization_id = $2 and deleted_at is null",
      [input.invoiceId, context.organizationId],
    );
    const invoice = rows[0];
    if (!invoice) throw new AppError("not_found", "Facture introuvable.");
    if (["paid", "cancelled"].includes(invoice.status)) {
      throw new AppError("conflict", "Une facture payée ou annulée ne peut plus être modifiée.");
    }
    await tx.query("delete from invoice_items where id = $1 and invoice_id = $2", [
      input.itemId,
      input.invoiceId,
    ]);
    await recalculateInvoice(tx, input.invoiceId);
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "invoice.item.delete",
      entityType: "invoice",
      entityId: input.invoiceId,
      summary: `Suppression d'une ligne de la facture ${invoice.number}`,
    });
  });
}

const INVOICE_TRANSITIONS: Record<string, string[]> = {
  draft: ["sent", "cancelled"],
  sent: ["overdue", "cancelled"],
  partial: ["overdue", "cancelled"],
  overdue: ["cancelled"],
  paid: [],
  cancelled: [],
};

export async function setInvoiceStatus(
  context: { userId: string; organizationId: string },
  input: { id: string; status: string },
): Promise<void> {
  await asMember(context, async (tx) => {
    const rows = await tx.query<{ status: string; number: string }>(
      "select status, number from invoices where id = $1 and organization_id = $2 and deleted_at is null",
      [input.id, context.organizationId],
    );
    const invoice = rows[0];
    if (!invoice) throw new AppError("not_found", "Facture introuvable.");
    const allowed = INVOICE_TRANSITIONS[invoice.status] ?? [];
    if (!allowed.includes(input.status)) {
      throw new AppError(
        "conflict",
        `Passage de « ${invoice.status} » à « ${input.status} » non autorisé. Utilisez un encaissement pour marquer une facture payée.`,
      );
    }
    await tx.query("update invoices set status = $2 where id = $1 and organization_id = $3", [
      input.id,
      input.status,
      context.organizationId,
    ]);
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "invoice.status",
      entityType: "invoice",
      entityId: input.id,
      summary: `Facture ${invoice.number} : ${invoice.status} → ${input.status}`,
      metadata: { from: invoice.status, to: input.status },
    });
  });
}

export async function recordPayment(
  context: { userId: string; organizationId: string },
  input: {
    invoiceId: string;
    amountMinor: number;
    paidAt: string;
    method: string;
    reference: string | null;
    notes: string | null;
  },
): Promise<void> {
  await asMember(context, async (tx) => {
    const rows = await tx.query<{
      status: string;
      number: string;
      currency: string;
      total: string;
      paid: string;
    }>(
      `select status, number, currency, total_minor::text as total, amount_paid_minor::text as paid
       from invoices where id = $1 and organization_id = $2 and deleted_at is null`,
      [input.invoiceId, context.organizationId],
    );
    const invoice = rows[0];
    if (!invoice) throw new AppError("not_found", "Facture introuvable.");
    if (invoice.status === "cancelled") {
      throw new AppError("conflict", "Impossible d'encaisser une facture annulée.");
    }
    if (input.amountMinor <= 0) {
      throw new AppError("validation", "Le montant encaissé doit être supérieur à zéro.");
    }
    const remaining = Number(invoice.total) - Number(invoice.paid);
    if (input.amountMinor > remaining) {
      throw new AppError(
        "validation",
        `Le montant dépasse le solde restant (${remaining} en unité mineure).`,
      );
    }

    await tx.query(
      `insert into payments (organization_id, invoice_id, amount_minor, currency, paid_at, method, reference, notes, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        context.organizationId,
        input.invoiceId,
        input.amountMinor,
        invoice.currency,
        input.paidAt,
        input.method,
        input.reference,
        input.notes,
        context.userId,
      ],
    );

    // Une recette est enregistrée pour que le tableau de bord reste cohérent (logique de trésorerie,
    // et non de comptabilité d'engagement).
    await tx.query(
      `insert into revenues
        (organization_id, label, amount_minor, currency, received_at, invoice_id, method, reference, notes, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        context.organizationId,
        `Encaissement facture ${invoice.number}`,
        input.amountMinor,
        invoice.currency,
        input.paidAt,
        input.invoiceId,
        input.method,
        input.reference,
        input.notes,
        context.userId,
      ],
    );

    await recalculateInvoice(tx, input.invoiceId);

    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "invoice.payment",
      entityType: "invoice",
      entityId: input.invoiceId,
      summary: `Encaissement sur la facture ${invoice.number}`,
      metadata: { amountMinor: input.amountMinor, method: input.method },
    });
  });
}

export async function deleteInvoice(
  context: { userId: string; organizationId: string },
  invoiceId: string,
): Promise<void> {
  await asMember(context, async (tx) => {
    const rows = await tx.query<{ status: string; number: string; paid: string }>(
      "select status, number, amount_paid_minor::text as paid from invoices where id = $1 and organization_id = $2 and deleted_at is null",
      [invoiceId, context.organizationId],
    );
    const invoice = rows[0];
    if (!invoice) throw new AppError("not_found", "Facture introuvable.");
    if (Number(invoice.paid) > 0) {
      throw new AppError("conflict", "Une facture comportant des encaissements ne peut pas être supprimée.");
    }
    await tx.query("update invoices set deleted_at = now() where id = $1 and organization_id = $2", [
      invoiceId,
      context.organizationId,
    ]);
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "invoice.delete",
      entityType: "invoice",
      entityId: invoiceId,
      summary: `Suppression de la facture ${invoice.number}`,
    });
  });
}

/* ------------------------------------------------------------------ Devis */

export interface QuoteListItem {
  id: string;
  number: string;
  subject: string;
  customer_id: string | null;
  customer_name: string | null;
  status: string;
  issue_date: string;
  valid_until: string | null;
  currency: string;
  subtotal_minor: string;
  total_minor: string;
}

export async function listQuotes(
  context: { userId: string; organizationId: string },
  filters: { q?: string; status?: string; page?: number; pageSize?: number } = {},
): Promise<Paginated<QuoteListItem>> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 20));

  return asMember(context, async (tx) => {
    const values: unknown[] = [context.organizationId];
    const conditions = ["q.organization_id = $1", "q.deleted_at is null"];
    if (filters.status && filters.status !== "all") {
      values.push(filters.status);
      conditions.push(`q.status = $${values.length}`);
    }
    if (filters.q?.trim()) {
      values.push(`%${filters.q.trim()}%`);
      conditions.push(`(q.number ilike $${values.length} or q.subject ilike $${values.length})`);
    }
    const where = conditions.join(" and ");

    const count = await tx.query<{ count: number }>(
      `select count(*)::int as count from quotes q where ${where}`,
      values,
    );
    const rows = await tx.query<QuoteListItem>(
      `select q.id, q.number, q.subject, q.customer_id, c.name as customer_name, q.status,
              q.issue_date, q.valid_until, q.currency, q.subtotal_minor::text, q.total_minor::text
       from quotes q left join customers c on c.id = q.customer_id
       where ${where}
       order by q.issue_date desc, q.number desc
       limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, pageSize, (page - 1) * pageSize],
    );
    return paginate(rows, count[0]?.count ?? 0, page, pageSize);
  });
}

export async function getQuote(
  context: { userId: string; organizationId: string },
  quoteId: string,
): Promise<{
  quote: QuoteListItem & { notes: string | null; terms: string | null };
  items: InvoiceItemRow[];
}> {
  return asMember(context, async (tx) => {
    const rows = await tx.query<QuoteListItem & { notes: string | null; terms: string | null }>(
      `select q.id, q.number, q.subject, q.customer_id, c.name as customer_name, q.status,
              q.issue_date, q.valid_until, q.currency, q.subtotal_minor::text, q.total_minor::text,
              q.notes, q.terms
       from quotes q left join customers c on c.id = q.customer_id
       where q.id = $1 and q.organization_id = $2 and q.deleted_at is null`,
      [quoteId, context.organizationId],
    );
    const quote = rows[0];
    if (!quote) throw new AppError("not_found", "Devis introuvable.");
    const items = await tx.query<InvoiceItemRow>(
      `select id, description, quantity::text, unit_price_minor::text, amount_minor::text
       from quote_items where quote_id = $1 order by position, id`,
      [quoteId],
    );
    return { quote, items };
  });
}

export async function createQuote(
  context: { userId: string; organizationId: string },
  input: {
    customerId: string | null;
    subject: string;
    issueDate: string;
    validUntil: string | null;
    taxRate: number;
    notes: string | null;
    terms: string | null;
    lineDescription: string;
    quantity: number;
    unitPriceMinor: number;
  },
): Promise<{ id: string; number: string }> {
  return asMember(context, async (tx) => {
    const currency = await organizationCurrency(tx, context.organizationId);
    const number = await nextNumber(tx, context.organizationId, "quotes", "DEV");
    const amount = Math.round(input.quantity * input.unitPriceMinor);
    const tax = Math.round((amount * input.taxRate) / 100);

    const rows = await tx.query<{ id: string }>(
      `insert into quotes
        (organization_id, number, customer_id, subject, status, issue_date, valid_until, currency,
         subtotal_minor, tax_rate, total_minor, notes, terms, created_by)
       values ($1, $2, $3, $4, 'draft', $5, $6, $7, $8, $9, $10, $11, $12, $13)
       returning id`,
      [
        context.organizationId,
        number,
        input.customerId,
        input.subject,
        input.issueDate,
        input.validUntil,
        currency,
        amount,
        input.taxRate,
        amount + tax,
        input.notes,
        input.terms,
        context.userId,
      ],
    );
    const quoteId = rows[0]!.id;
    await tx.query(
      `insert into quote_items (quote_id, description, quantity, unit_price_minor, amount_minor, position)
       values ($1, $2, $3, $4, $5, 10)`,
      [quoteId, input.lineDescription, input.quantity, input.unitPriceMinor, amount],
    );
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "quote.create",
      entityType: "quote",
      entityId: quoteId,
      summary: `Création du devis ${number}`,
      metadata: { totalMinor: amount + tax, currency },
    });
    return { id: quoteId, number };
  });
}

export async function addQuoteItem(
  context: { userId: string; organizationId: string },
  input: { quoteId: string; description: string; quantity: number; unitPriceMinor: number },
): Promise<void> {
  await asMember(context, async (tx) => {
    const rows = await tx.query<{ status: string; number: string }>(
      "select status, number from quotes where id = $1 and organization_id = $2 and deleted_at is null",
      [input.quoteId, context.organizationId],
    );
    const quote = rows[0];
    if (!quote) throw new AppError("not_found", "Devis introuvable.");
    if (["accepted", "rejected", "expired"].includes(quote.status)) {
      throw new AppError("conflict", "Un devis clos ne peut plus être modifié.");
    }
    const position = await tx.query<{ next: number }>(
      "select coalesce(max(position), 0) + 10 as next from quote_items where quote_id = $1",
      [input.quoteId],
    );
    const amount = Math.round(input.quantity * input.unitPriceMinor);
    await tx.query(
      `insert into quote_items (quote_id, description, quantity, unit_price_minor, amount_minor, position)
       values ($1, $2, $3, $4, $5, $6)`,
      [input.quoteId, input.description, input.quantity, input.unitPriceMinor, amount, position[0]?.next ?? 10],
    );
    await recalculateQuote(tx, input.quoteId);
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "quote.item.add",
      entityType: "quote",
      entityId: input.quoteId,
      summary: `Ajout d'une ligne au devis ${quote.number}`,
    });
  });
}

export async function setQuoteStatus(
  context: { userId: string; organizationId: string },
  input: { id: string; status: string },
): Promise<void> {
  await asMember(context, async (tx) => {
    const rows = await tx.query<{ status: string; number: string }>(
      "select status, number from quotes where id = $1 and organization_id = $2 and deleted_at is null",
      [input.id, context.organizationId],
    );
    const quote = rows[0];
    if (!quote) throw new AppError("not_found", "Devis introuvable.");
    const allowed: Record<string, string[]> = {
      draft: ["sent", "accepted", "rejected", "expired"],
      sent: ["accepted", "rejected", "expired"],
      accepted: [],
      rejected: [],
      expired: [],
    };
    if (!(allowed[quote.status] ?? []).includes(input.status)) {
      throw new AppError("conflict", `Passage de « ${quote.status} » à « ${input.status} » non autorisé.`);
    }
    await tx.query("update quotes set status = $2 where id = $1 and organization_id = $3", [
      input.id,
      input.status,
      context.organizationId,
    ]);
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "quote.status",
      entityType: "quote",
      entityId: input.id,
      summary: `Devis ${quote.number} : ${quote.status} → ${input.status}`,
    });
  });
}

/** Transforme un devis accepté (ou en cours) en facture brouillon, lignes recopiées. */
export async function convertQuoteToInvoice(
  context: { userId: string; organizationId: string },
  quoteId: string,
): Promise<{ id: string; number: string }> {
  return asMember(context, async (tx) => {
    const rows = await tx.query<{ number: string; customer_id: string | null; tax_rate: string; currency: string; status: string }>(
      `select number, customer_id, tax_rate::text, currency, status
       from quotes where id = $1 and organization_id = $2 and deleted_at is null`,
      [quoteId, context.organizationId],
    );
    const quote = rows[0];
    if (!quote) throw new AppError("not_found", "Devis introuvable.");
    if (!quote.customer_id) {
      throw new AppError("validation", "Renseignez un client sur le devis avant de le facturer.");
    }
    const already = await tx.query<{ id: string }>(
      "select id from invoices where quote_id = $1 and organization_id = $2 and deleted_at is null",
      [quoteId, context.organizationId],
    );
    if (already.length > 0) {
      throw new AppError("conflict", "Ce devis a déjà été facturé.");
    }

    const items = await tx.query<InvoiceItemRow>(
      `select id, description, quantity::text, unit_price_minor::text, amount_minor::text
       from quote_items where quote_id = $1 order by position, id`,
      [quoteId],
    );
    if (items.length === 0) {
      throw new AppError("validation", "Le devis ne contient aucune ligne à facturer.");
    }

    const subtotal = items.reduce((sum, item) => sum + Number(item.amount_minor), 0);
    const tax = Math.round((subtotal * Number(quote.tax_rate)) / 100);
    const number = await nextNumber(tx, context.organizationId, "invoices", "FAC");
    const today = new Date().toISOString().slice(0, 10);

    const invoiceRows = await tx.query<{ id: string }>(
      `insert into invoices
        (organization_id, number, customer_id, quote_id, status, issue_date, currency,
         subtotal_minor, tax_rate, tax_minor, total_minor, amount_paid_minor, notes, created_by)
       values ($1, $2, $3, $4, 'draft', $5, $6, $7, $8, $9, $10, 0, $11, $12)
       returning id`,
      [
        context.organizationId,
        number,
        quote.customer_id,
        quoteId,
        today,
        quote.currency,
        subtotal,
        Number(quote.tax_rate),
        tax,
        subtotal + tax,
        `Créée à partir du devis ${quote.number}.`,
        context.userId,
      ],
    );
    const invoiceId = invoiceRows[0]!.id;

    let position = 10;
    for (const item of items) {
      await tx.query(
        `insert into invoice_items (invoice_id, description, quantity, unit_price_minor, amount_minor, position)
         values ($1, $2, $3, $4, $5, $6)`,
        [invoiceId, item.description, Number(item.quantity), Number(item.unit_price_minor), Number(item.amount_minor), position],
      );
      position += 10;
    }

    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "quote.convert",
      entityType: "invoice",
      entityId: invoiceId,
      summary: `Devis ${quote.number} facturé (${number})`,
    });

    return { id: invoiceId, number };
  });
}

/* ------------------------------------------------------------------ Dépenses */

export interface ExpenseRow {
  id: string;
  label: string;
  amount_minor: string;
  currency: string;
  expense_date: string;
  status: string;
  supplier: string | null;
  reference: string | null;
  method: string;
  category_name: string | null;
  project_name: string | null;
  department_name: string | null;
  created_by_name: string | null;
}

export async function listExpenses(
  context: { userId: string; organizationId: string },
  filters: { q?: string; status?: string; page?: number; pageSize?: number } = {},
): Promise<Paginated<ExpenseRow>> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 20));

  return asMember(context, async (tx) => {
    const values: unknown[] = [context.organizationId];
    const conditions = ["e.organization_id = $1", "e.deleted_at is null"];
    if (filters.status && filters.status !== "all") {
      values.push(filters.status);
      conditions.push(`e.status = $${values.length}`);
    }
    if (filters.q?.trim()) {
      values.push(`%${filters.q.trim()}%`);
      conditions.push(`(e.label ilike $${values.length} or coalesce(e.supplier, '') ilike $${values.length})`);
    }
    const where = conditions.join(" and ");

    const count = await tx.query<{ count: number }>(
      `select count(*)::int as count from expenses e where ${where}`,
      values,
    );
    const rows = await tx.query<ExpenseRow>(
      `select e.id, e.label, e.amount_minor::text, e.currency, e.expense_date, e.status, e.supplier,
              e.reference, e.method, fc.name as category_name, p.name as project_name,
              d.name as department_name, pr.full_name as created_by_name
       from expenses e
       left join financial_categories fc on fc.id = e.category_id
       left join projects p on p.id = e.project_id
       left join departments d on d.id = e.department_id
       left join profiles pr on pr.id = e.created_by
       where ${where}
       order by e.expense_date desc, e.created_at desc
       limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, pageSize, (page - 1) * pageSize],
    );
    return paginate(rows, count[0]?.count ?? 0, page, pageSize);
  });
}

export async function createExpense(
  context: { userId: string; organizationId: string },
  input: {
    categoryId: string | null;
    label: string;
    amountMinor: number;
    expenseDate: string;
    projectId: string | null;
    departmentId: string | null;
    supplier: string | null;
    method: string;
    reference: string | null;
    notes: string | null;
  },
): Promise<void> {
  if (input.amountMinor <= 0) {
    throw new AppError("validation", "Le montant de la dépense doit être supérieur à zéro.");
  }
  await asMember(context, async (tx) => {
    const currency = await organizationCurrency(tx, context.organizationId);
    const rows = await tx.query<{ id: string }>(
      `insert into expenses
        (organization_id, category_id, label, amount_minor, currency, expense_date, project_id,
         department_id, supplier, method, reference, status, notes, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending', $12, $13)
       returning id`,
      [
        context.organizationId,
        input.categoryId,
        input.label,
        input.amountMinor,
        currency,
        input.expenseDate,
        input.projectId,
        input.departmentId,
        input.supplier,
        input.method,
        input.reference,
        input.notes,
        context.userId,
      ],
    );
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "expense.create",
      entityType: "expense",
      entityId: rows[0]!.id,
      summary: `Dépense « ${input.label} » enregistrée (en attente de validation)`,
      metadata: { amountMinor: input.amountMinor, currency },
    });
  });
}

export async function decideExpense(
  context: { userId: string; organizationId: string },
  input: { id: string; decision: "approved" | "rejected"; comment: string | null },
): Promise<void> {
  await asMember(context, async (tx) => {
    const rows = await tx.query<{ status: string; label: string; created_by: string | null }>(
      `select status, label, created_by from expenses
       where id = $1 and organization_id = $2 and deleted_at is null`,
      [input.id, context.organizationId],
    );
    const expense = rows[0];
    if (!expense) throw new AppError("not_found", "Dépense introuvable.");
    if (expense.status !== "pending") {
      throw new AppError("conflict", "Cette dépense a déjà été traitée.");
    }
    if (input.decision === "approved" && expense.created_by === context.userId) {
      throw new AppError(
        "forbidden",
        "Vous ne pouvez pas valider vous-même une dépense que vous avez créée (séparation des rôles).",
      );
    }
    await tx.query(
      `update expenses set status = $2, approved_by = $3, approved_at = now(),
         notes = case when $4::text is null then notes else coalesce(notes, '') || ' | Décision : ' || $4 end
       where id = $1 and organization_id = $5`,
      [input.id, input.decision, context.userId, input.comment, context.organizationId],
    );
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: input.decision === "approved" ? "expense.approve" : "expense.reject",
      entityType: "expense",
      entityId: input.id,
      summary: `Dépense « ${expense.label} » ${input.decision === "approved" ? "validée" : "refusée"}`,
      metadata: { comment: input.comment },
    });
  });
}

export async function deleteExpense(
  context: { userId: string; organizationId: string },
  expenseId: string,
): Promise<void> {
  await asMember(context, async (tx) => {
    const rows = await tx.query<{ status: string; label: string }>(
      "select status, label from expenses where id = $1 and organization_id = $2 and deleted_at is null",
      [expenseId, context.organizationId],
    );
    const expense = rows[0];
    if (!expense) throw new AppError("not_found", "Dépense introuvable.");
    if (expense.status === "approved") {
      throw new AppError("conflict", "Une dépense validée ne peut pas être supprimée.");
    }
    await tx.query("update expenses set deleted_at = now() where id = $1 and organization_id = $2", [
      expenseId,
      context.organizationId,
    ]);
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "expense.delete",
      entityType: "expense",
      entityId: expenseId,
      summary: `Suppression de la dépense « ${expense.label} »`,
    });
  });
}

/* ------------------------------------------------------------------ Recettes */

export interface RevenueRow {
  id: string;
  label: string;
  amount_minor: string;
  currency: string;
  received_at: string;
  method: string;
  reference: string | null;
  invoice_id: string | null;
  category_name: string | null;
}

export async function listRevenues(
  context: { userId: string; organizationId: string },
  filters: { q?: string; page?: number; pageSize?: number } = {},
): Promise<Paginated<RevenueRow>> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 20));

  return asMember(context, async (tx) => {
    const values: unknown[] = [context.organizationId];
    const conditions = ["r.organization_id = $1", "r.deleted_at is null"];
    if (filters.q?.trim()) {
      values.push(`%${filters.q.trim()}%`);
      conditions.push(`r.label ilike $${values.length}`);
    }
    const where = conditions.join(" and ");
    const count = await tx.query<{ count: number }>(
      `select count(*)::int as count from revenues r where ${where}`,
      values,
    );
    const rows = await tx.query<RevenueRow>(
      `select r.id, r.label, r.amount_minor::text, r.currency, r.received_at, r.method,
              r.reference, r.invoice_id, fc.name as category_name
       from revenues r left join financial_categories fc on fc.id = r.category_id
       where ${where}
       order by r.received_at desc, r.created_at desc
       limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, pageSize, (page - 1) * pageSize],
    );
    return paginate(rows, count[0]?.count ?? 0, page, pageSize);
  });
}

export async function createRevenue(
  context: { userId: string; organizationId: string },
  input: {
    categoryId: string | null;
    label: string;
    amountMinor: number;
    receivedAt: string;
    method: string;
    reference: string | null;
    notes: string | null;
  },
): Promise<void> {
  if (input.amountMinor <= 0) {
    throw new AppError("validation", "Le montant de la recette doit être supérieur à zéro.");
  }
  await asMember(context, async (tx) => {
    const currency = await organizationCurrency(tx, context.organizationId);
    const rows = await tx.query<{ id: string }>(
      `insert into revenues
        (organization_id, category_id, label, amount_minor, currency, received_at, method, reference, notes, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
      [
        context.organizationId,
        input.categoryId,
        input.label,
        input.amountMinor,
        currency,
        input.receivedAt,
        input.method,
        input.reference,
        input.notes,
        context.userId,
      ],
    );
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "revenue.create",
      entityType: "revenue",
      entityId: rows[0]!.id,
      summary: `Recette « ${input.label} » enregistrée`,
      metadata: { amountMinor: input.amountMinor, currency },
    });
  });
}

export async function deleteRevenue(
  context: { userId: string; organizationId: string },
  revenueId: string,
): Promise<void> {
  await asMember(context, async (tx) => {
    const rows = await tx.query<{ label: string; invoice_id: string | null }>(
      "select label, invoice_id from revenues where id = $1 and organization_id = $2 and deleted_at is null",
      [revenueId, context.organizationId],
    );
    const revenue = rows[0];
    if (!revenue) throw new AppError("not_found", "Recette introuvable.");
    if (revenue.invoice_id) {
      throw new AppError(
        "conflict",
        "Cette recette provient d'un encaissement de facture : supprimez l'encaissement correspondant.",
      );
    }
    await tx.query("update revenues set deleted_at = now() where id = $1 and organization_id = $2", [
      revenueId,
      context.organizationId,
    ]);
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "revenue.delete",
      entityType: "revenue",
      entityId: revenueId,
      summary: `Suppression de la recette « ${revenue.label} »`,
    });
  });
}

/* ------------------------------------------------------------------ Catégories */

export interface FinancialCategoryRow {
  id: string;
  name: string;
  kind: string;
  entries_count: number;
}

export async function listFinancialCategories(context: {
  userId: string;
  organizationId: string;
}): Promise<FinancialCategoryRow[]> {
  return asMember(context, (tx) =>
    tx.query<FinancialCategoryRow>(
      `select fc.id, fc.name, fc.kind,
              (case when fc.kind = 'income'
                 then (select count(*)::int from revenues r where r.category_id = fc.id and r.deleted_at is null)
                 else (select count(*)::int from expenses e where e.category_id = fc.id and e.deleted_at is null)
               end) as entries_count
       from financial_categories fc
       where fc.organization_id = $1
       order by fc.kind, fc.name`,
      [context.organizationId],
    ),
  );
}

export async function createFinancialCategory(
  context: { userId: string; organizationId: string },
  input: { kind: "income" | "expense"; name: string },
): Promise<void> {
  await asMember(context, async (tx) => {
    const existing = await tx.query<{ id: string }>(
      "select id from financial_categories where organization_id = $1 and kind = $2 and lower(name) = lower($3)",
      [context.organizationId, input.kind, input.name],
    );
    if (existing.length > 0) {
      throw new AppError("conflict", "Cette catégorie existe déjà pour ce type.");
    }
    await tx.query(
      "insert into financial_categories (organization_id, kind, name) values ($1, $2, $3)",
      [context.organizationId, input.kind, input.name],
    );
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "finance.category.create",
      entityType: "financial_category",
      summary: `Création de la catégorie financière « ${input.name} »`,
      metadata: { kind: input.kind },
    });
  });
}
