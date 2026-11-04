import { requirePagePermission } from "@/lib/server/context";
import { listInvoices } from "@/modules/finance/service";
import { csvResponse, toCsv } from "@/lib/csv";
import { AppError } from "@/lib/server/errors";

/** Export CSV des factures (permission `finance:export`). */
export async function GET(request: Request) {
  const context = await requirePagePermission("finance", "export");
  if (!context.organization) throw new AppError("unauthorized", "Aucune organisation active.");

  const url = new URL(request.url);
  const invoices = await listInvoices(
    { userId: context.user.id, organizationId: context.organization.id },
    {
      q: url.searchParams.get("q") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      page: 1,
      pageSize: 100,
    },
  );

  const csv = toCsv(
    [
      "Numéro",
      "Client",
      "Statut",
      "Émission",
      "Échéance",
      "Devise",
      "Sous-total (unité mineure)",
      "Taxe (unité mineure)",
      "Total (unité mineure)",
      "Encaissé (unité mineure)",
    ],
    invoices.items.map((invoice) => [
      invoice.number,
      invoice.customer_name,
      invoice.status,
      invoice.issue_date,
      invoice.due_date,
      invoice.currency,
      invoice.subtotal_minor,
      invoice.tax_minor,
      invoice.total_minor,
      invoice.amount_paid_minor,
    ]),
  );

  return csvResponse(`factures-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
