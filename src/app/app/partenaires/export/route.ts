import { requirePagePermission } from "@/lib/server/context";
import { listPartners } from "@/modules/partners/service";
import { csvResponse, toCsv } from "@/lib/csv";
import { AppError } from "@/lib/server/errors";
import { PARTNER_STATUS_LABELS, PARTNER_TYPE_LABELS } from "@/lib/validation/partners";

export async function GET(request: Request) {
  const context = await requirePagePermission("partners", "export");
  if (!context.organization) throw new AppError("unauthorized", "Aucune organisation active.");

  const url = new URL(request.url);
  const pageSize = 100;
  const rows: Awaited<ReturnType<typeof listPartners>>["items"] = [];
  for (let page = 1; page <= 20; page += 1) {
    const batch = await listPartners(
      { userId: context.user.id, organizationId: context.organization.id },
      {
        q: url.searchParams.get("q") ?? undefined,
        type: url.searchParams.get("type") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
        page,
        pageSize,
      },
    );
    rows.push(...batch.items);
    if (page >= batch.totalPages) break;
  }

  const csv = toCsv(
    ["Nom", "Type", "Statut", "Contact principal", "E-mail", "Téléphone", "Ville", "Pays", "Contacts", "Conventions", "Créé le"],
    rows.map((partner) => [
      partner.name,
      PARTNER_TYPE_LABELS[partner.type as keyof typeof PARTNER_TYPE_LABELS] ?? partner.type,
      PARTNER_STATUS_LABELS[partner.status as keyof typeof PARTNER_STATUS_LABELS] ?? partner.status,
      partner.contact_person,
      partner.email,
      partner.phone,
      partner.city,
      partner.country,
      partner.contacts_count,
      partner.agreements_count,
      partner.created_at.slice(0, 10),
    ]),
  );

  return csvResponse(`partenaires-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
