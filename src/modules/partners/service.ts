import { asMember } from "@/lib/db";
import { AppError } from "@/lib/server/errors";
import { recordAudit } from "@/lib/server/audit";

/**
 * Module Partenaires : fournisseurs, institutions, distributeurs, ONG.
 * Gère les fiches, les contacts et les conventions (accords) avec leur statut.
 */

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PartnerListItem {
  id: string;
  name: string;
  type: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  status: string;
  contact_person: string | null;
  created_at: string;
  contacts_count: number;
  agreements_count: number;
}

export interface PartnerFilters {
  q?: string;
  type?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export async function listPartners(
  context: { userId: string; organizationId: string },
  filters: PartnerFilters = {},
): Promise<Paginated<PartnerListItem>> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 20));

  return asMember(context, async (tx) => {
    const values: unknown[] = [context.organizationId];
    const conditions = ["p.organization_id = $1", "p.deleted_at is null"];
    if (filters.type && filters.type !== "all") {
      values.push(filters.type);
      conditions.push(`p.type = $${values.length}`);
    }
    if (filters.status && filters.status !== "all") {
      values.push(filters.status);
      conditions.push(`p.status = $${values.length}`);
    }
    if (filters.q?.trim()) {
      values.push(`%${filters.q.trim()}%`);
      conditions.push(`(p.name ilike $${values.length} or coalesce(p.city, '') ilike $${values.length})`);
    }
    const where = conditions.join(" and ");

    const count = await tx.query<{ count: number }>(
      `select count(*)::int as count from partners p where ${where}`,
      values,
    );
    const rows = await tx.query<PartnerListItem>(
      `select p.id, p.name, p.type, p.email, p.phone, p.city, p.country, p.status,
              p.contact_person, p.created_at,
              (select count(*)::int from partner_contacts c where c.partner_id = p.id) as contacts_count,
              (select count(*)::int from partner_agreements a where a.partner_id = p.id) as agreements_count
       from partners p
       where ${where}
       order by p.name asc
       limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, pageSize, (page - 1) * pageSize],
    );
    return {
      items: rows,
      total: count[0]?.count ?? 0,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil((count[0]?.count ?? 0) / pageSize)),
    };
  });
}

export interface PartnerDetail {
  partner: PartnerListItem & {
    website: string | null;
    address: string | null;
    contact_person: string | null;
    notes: string | null;
    created_at: string;
  };
  contacts: {
    id: string;
    full_name: string;
    role_title: string | null;
    email: string | null;
    phone: string | null;
    is_primary: boolean;
  }[];
  agreements: {
    id: string;
    title: string;
    reference: string | null;
    start_date: string | null;
    end_date: string | null;
    status: string;
    notes: string | null;
  }[];
}

export async function getPartner(
  context: { userId: string; organizationId: string },
  partnerId: string,
): Promise<PartnerDetail> {
  return asMember(context, async (tx) => {
    const rows = await tx.query<PartnerDetail["partner"]>(
      `select p.id, p.name, p.type, p.email, p.phone, p.city, p.country, p.status, p.website,
              p.address, p.contact_person, p.notes, p.created_at,
              (select count(*)::int from partner_contacts c where c.partner_id = p.id) as contacts_count,
              (select count(*)::int from partner_agreements a where a.partner_id = p.id) as agreements_count
       from partners p
       where p.id = $1 and p.organization_id = $2 and p.deleted_at is null`,
      [partnerId, context.organizationId],
    );
    const partner = rows[0];
    if (!partner) throw new AppError("not_found", "Partenaire introuvable.");

    const [contacts, agreements] = await Promise.all([
      tx.query<PartnerDetail["contacts"][number]>(
        `select id, full_name, role_title, email, phone, is_primary
         from partner_contacts where partner_id = $1
         order by is_primary desc, full_name`,
        [partnerId],
      ),
      tx.query<PartnerDetail["agreements"][number]>(
        `select id, title, reference, start_date, end_date, status, notes
         from partner_agreements where partner_id = $1 order by start_date desc nulls last`,
        [partnerId],
      ),
    ]);

    return { partner, contacts, agreements };
  });
}

export interface PartnerInput {
  name: string;
  type: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  contactPerson: string | null;
  status: string;
  notes: string | null;
}

export async function createPartner(
  context: { userId: string; organizationId: string },
  input: PartnerInput,
): Promise<string> {
  return asMember(context, async (tx) => {
    const rows = await tx.query<{ id: string }>(
      `insert into partners
        (organization_id, name, type, email, phone, website, address, city, country, contact_person,
         status, notes, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       returning id`,
      [
        context.organizationId,
        input.name,
        input.type,
        input.email,
        input.phone,
        input.website,
        input.address,
        input.city,
        input.country,
        input.contactPerson,
        input.status,
        input.notes,
        context.userId,
      ],
    );
    const partnerId = rows[0]!.id;
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "partner.create",
      entityType: "partner",
      entityId: partnerId,
      summary: `Création du partenaire « ${input.name} »`,
    });
    return partnerId;
  });
}

export async function updatePartner(
  context: { userId: string; organizationId: string },
  input: PartnerInput & { id: string },
): Promise<void> {
  await asMember(context, async (tx) => {
    const existing = await tx.query<{ id: string }>(
      "select id from partners where id = $1 and organization_id = $2 and deleted_at is null",
      [input.id, context.organizationId],
    );
    if (!existing[0]) throw new AppError("not_found", "Partenaire introuvable.");
    await tx.query(
      `update partners set name = $2, type = $3, email = $4, phone = $5, website = $6, address = $7,
         city = $8, country = $9, contact_person = $10, status = $11, notes = $12
       where id = $1 and organization_id = $13`,
      [
        input.id,
        input.name,
        input.type,
        input.email,
        input.phone,
        input.website,
        input.address,
        input.city,
        input.country,
        input.contactPerson,
        input.status,
        input.notes,
        context.organizationId,
      ],
    );
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "partner.update",
      entityType: "partner",
      entityId: input.id,
      summary: `Mise à jour du partenaire « ${input.name} »`,
    });
  });
}

export async function deletePartner(
  context: { userId: string; organizationId: string },
  partnerId: string,
): Promise<void> {
  await asMember(context, async (tx) => {
    const rows = await tx.query<{ name: string }>(
      "select name from partners where id = $1 and organization_id = $2 and deleted_at is null",
      [partnerId, context.organizationId],
    );
    if (!rows[0]) throw new AppError("not_found", "Partenaire introuvable.");
    await tx.query("update partners set deleted_at = now() where id = $1 and organization_id = $2", [
      partnerId,
      context.organizationId,
    ]);
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "partner.delete",
      entityType: "partner",
      entityId: partnerId,
      summary: `Archivage du partenaire « ${rows[0].name} »`,
    });
  });
}

export async function addPartnerContact(
  context: { userId: string; organizationId: string },
  input: {
    partnerId: string;
    fullName: string;
    roleTitle: string | null;
    email: string | null;
    phone: string | null;
    isPrimary: boolean;
  },
): Promise<void> {
  await asMember(context, async (tx) => {
    const partner = await tx.query<{ name: string }>(
      "select name from partners where id = $1 and organization_id = $2 and deleted_at is null",
      [input.partnerId, context.organizationId],
    );
    if (!partner[0]) throw new AppError("not_found", "Partenaire introuvable.");
    if (input.isPrimary) {
      await tx.query("update partner_contacts set is_primary = false where partner_id = $1", [input.partnerId]);
    }
    await tx.query(
      `insert into partner_contacts (organization_id, partner_id, full_name, role_title, email, phone, is_primary)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        context.organizationId,
        input.partnerId,
        input.fullName,
        input.roleTitle,
        input.email,
        input.phone,
        input.isPrimary,
      ],
    );
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "partner.contact.create",
      entityType: "partner",
      entityId: input.partnerId,
      summary: `Ajout du contact « ${input.fullName} » chez ${partner[0].name}`,
    });
  });
}

export async function deletePartnerContact(
  context: { userId: string; organizationId: string },
  input: { partnerId: string; contactId: string },
): Promise<void> {
  await asMember(context, async (tx) => {
    await tx.query(
      "delete from partner_contacts where id = $1 and partner_id = $2 and organization_id = $3",
      [input.contactId, input.partnerId, context.organizationId],
    );
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "partner.contact.delete",
      entityType: "partner",
      entityId: input.partnerId,
      summary: "Suppression d'un contact partenaire",
    });
  });
}

export async function addAgreement(
  context: { userId: string; organizationId: string },
  input: {
    partnerId: string;
    title: string;
    reference: string | null;
    startDate: string | null;
    endDate: string | null;
    status: string;
    notes: string | null;
  },
): Promise<void> {
  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    throw new AppError("validation", "La date de fin précède la date de début de la convention.");
  }
  await asMember(context, async (tx) => {
    const partner = await tx.query<{ name: string }>(
      "select name from partners where id = $1 and organization_id = $2 and deleted_at is null",
      [input.partnerId, context.organizationId],
    );
    if (!partner[0]) throw new AppError("not_found", "Partenaire introuvable.");
    await tx.query(
      `insert into partner_agreements
        (organization_id, partner_id, title, reference, start_date, end_date, status, notes)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        context.organizationId,
        input.partnerId,
        input.title,
        input.reference,
        input.startDate,
        input.endDate,
        input.status,
        input.notes,
      ],
    );
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "partner.agreement.create",
      entityType: "partner",
      entityId: input.partnerId,
      summary: `Ajout de la convention « ${input.title} » (${partner[0].name})`,
    });
  });
}

export async function deleteAgreement(
  context: { userId: string; organizationId: string },
  input: { partnerId: string; agreementId: string },
): Promise<void> {
  await asMember(context, async (tx) => {
    await tx.query(
      "delete from partner_agreements where id = $1 and partner_id = $2 and organization_id = $3",
      [input.agreementId, input.partnerId, context.organizationId],
    );
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "partner.agreement.delete",
      entityType: "partner",
      entityId: input.partnerId,
      summary: "Suppression d'une convention partenaire",
    });
  });
}
