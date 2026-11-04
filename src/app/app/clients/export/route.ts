import { requirePagePermission } from "@/lib/server/context";
import { listCustomers } from "@/modules/crm/service";
import { csvResponse, toCsv } from "@/lib/csv";
import { AppError } from "@/lib/server/errors";

export async function GET(request: Request) {
  const context = await requirePagePermission("crm", "export");
  if (!context.organization) throw new AppError("unauthorized", "Aucune organisation active.");

  const url = new URL(request.url);
  const all = await listCustomers(
    { userId: context.user.id, organizationId: context.organization.id },
    {
      q: url.searchParams.get("q") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      categoryId: url.searchParams.get("category") ?? undefined,
      page: 1,
      pageSize: 100,
    },
  );

  const csv = toCsv(
    ["Nom", "Catégorie", "E-mail", "Téléphone", "Ville", "Statut", "Contacts", "Projets", "Créé le"],
    all.items.map((customer) => [
      customer.name,
      customer.category_name,
      customer.email,
      customer.phone,
      customer.city,
      customer.status,
      customer.contacts_count,
      customer.projects_count,
      customer.created_at,
    ]),
  );

  return csvResponse(`clients-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
