import { asMember } from "@/lib/db";
import { AppError } from "@/lib/server/errors";
import { recordAudit } from "@/lib/server/audit";

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CustomerListItem {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  status: string;
  category_name: string | null;
  category_color: string | null;
  owner_name: string | null;
  created_at: string;
  contacts_count: number;
  projects_count: number;
}

export interface CustomerDetail {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  tax_id: string | null;
  status: string;
  category_id: string | null;
  category_name: string | null;
  owner_id: string | null;
  owner_name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactRow {
  id: string;
  full_name: string;
  role_title: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
}

export interface InteractionRow {
  id: string;
  type: string;
  subject: string;
  notes: string | null;
  occurred_at: string;
  author: string | null;
}

export interface CategoryRow {
  id: string;
  name: string;
  color: string;
  customers_count?: number;
}

export interface CustomerFilters {
  q?: string;
  status?: string;
  categoryId?: string;
  page?: number;
  pageSize?: number;
}

export const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  active: "Actif",
  inactive: "Inactif",
  archived: "Archivé",
};

export async function listCustomers(
  context: { userId: string; organizationId: string },
  filters: CustomerFilters,
): Promise<Paginated<CustomerListItem>> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 20));
  const offset = (page - 1) * pageSize;
  const q = filters.q?.trim() ? `%${filters.q.trim().toLowerCase()}%` : null;

  return asMember(context, async (tx) => {
    const rows = await tx.query<CustomerListItem>(
      `select c.id, c.name, c.email, c.phone, c.city, c.status, c.created_at,
              cat.name as category_name, cat.color as category_color,
              p.full_name as owner_name,
              (select count(*)::int from customer_contacts cc
                where cc.customer_id = c.id and cc.deleted_at is null) as contacts_count,
              (select count(*)::int from projects pr
                where pr.customer_id = c.id and pr.deleted_at is null) as projects_count
       from customers c
       left join customer_categories cat on cat.id = c.category_id
       left join profiles p on p.id = c.owner_id
       where c.organization_id = $1 and c.deleted_at is null
         and ($2::text is null or lower(c.name) like $2 or lower(coalesce(c.email, '')) like $2
              or lower(coalesce(c.city, '')) like $2)
         and ($3::text is null or c.status = $3)
         and ($4::uuid is null or c.category_id = $4)
       order by c.created_at desc
       limit $5 offset $6`,
      [context.organizationId, q, filters.status || null, filters.categoryId || null, pageSize, offset],
    );

    const count = await tx.query<{ total: number }>(
      `select count(*)::int as total from customers c
       where c.organization_id = $1 and c.deleted_at is null
         and ($2::text is null or lower(c.name) like $2 or lower(coalesce(c.email, '')) like $2
              or lower(coalesce(c.city, '')) like $2)
         and ($3::text is null or c.status = $3)
         and ($4::uuid is null or c.category_id = $4)`,
      [context.organizationId, q, filters.status || null, filters.categoryId || null],
    );

    const total = count[0]?.total ?? 0;
    return { items: rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  });
}

export async function getCustomer(
  context: { userId: string; organizationId: string },
  customerId: string,
): Promise<{
  customer: CustomerDetail;
  contacts: ContactRow[];
  interactions: InteractionRow[];
  documents: { id: string; name: string; mime_type: string; created_at: string }[];
  projects: { id: string; name: string; status: string; progress: number }[];
}> {
  return asMember(context, async (tx) => {
    const rows = await tx.query<CustomerDetail>(
      `select c.*, cat.name as category_name, p.full_name as owner_name
       from customers c
       left join customer_categories cat on cat.id = c.category_id
       left join profiles p on p.id = c.owner_id
       where c.id = $1 and c.organization_id = $2 and c.deleted_at is null`,
      [customerId, context.organizationId],
    );
    const customer = rows[0];
    if (!customer) throw new AppError("not_found", "Client introuvable.");

    const [contacts, interactions, documents, projects] = await Promise.all([
      tx.query<ContactRow>(
        `select id, full_name, role_title, email, phone, is_primary from customer_contacts
         where customer_id = $1 and organization_id = $2 and deleted_at is null
         order by is_primary desc, full_name asc`,
        [customerId, context.organizationId],
      ),
      tx.query<InteractionRow>(
        `select i.id, i.type, i.subject, i.notes, i.occurred_at, p.full_name as author
         from customer_interactions i left join profiles p on p.id = i.created_by
         where i.customer_id = $1 and i.organization_id = $2
         order by i.occurred_at desc limit 50`,
        [customerId, context.organizationId],
      ),
      tx.query<{ id: string; name: string; mime_type: string; created_at: string }>(
        `select id, name, mime_type, created_at from documents
         where organization_id = $1 and entity_type = 'customer' and entity_id = $2 and deleted_at is null
         order by created_at desc`,
        [context.organizationId, customerId],
      ),
      tx.query<{ id: string; name: string; status: string; progress: number }>(
        `select id, name, status, progress from projects
         where organization_id = $1 and customer_id = $2 and deleted_at is null
         order by created_at desc`,
        [context.organizationId, customerId],
      ),
    ]);

    return { customer, contacts, interactions, documents, projects };
  });
}

export async function createCustomer(
  context: { userId: string; organizationId: string },
  input: {
    name: string;
    email: string | null;
    phone: string | null;
    website: string | null;
    address: string | null;
    city: string | null;
    country: string | null;
    taxId: string | null;
    categoryId: string | null;
    status: string;
    notes: string | null;
  },
): Promise<string> {
  return asMember(context, async (tx) => {
    const rows = await tx.query<{ id: string }>(
      `insert into customers
        (organization_id, name, email, phone, website, address, city, country, tax_id, category_id,
         status, notes, owner_id, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
       returning id`,
      [
        context.organizationId,
        input.name,
        input.email,
        input.phone,
        input.website,
        input.address,
        input.city,
        input.country,
        input.taxId,
        input.categoryId,
        input.status,
        input.notes,
        context.userId,
      ],
    );
    const id = rows[0]!.id;
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "customer.create",
      entityType: "customer",
      entityId: id,
      summary: `Création du client « ${input.name} »`,
    });
    return id;
  });
}

export async function updateCustomer(
  context: { userId: string; organizationId: string },
  input: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    website: string | null;
    address: string | null;
    city: string | null;
    country: string | null;
    taxId: string | null;
    categoryId: string | null;
    status: string;
    notes: string | null;
  },
): Promise<void> {
  await asMember(context, async (tx) => {
    const updated = await tx.query<{ id: string }>(
      `update customers set
         name = $3, email = $4, phone = $5, website = $6, address = $7, city = $8, country = $9,
         tax_id = $10, category_id = $11, status = $12, notes = $13
       where id = $1 and organization_id = $2 and deleted_at is null
       returning id`,
      [
        input.id,
        context.organizationId,
        input.name,
        input.email,
        input.phone,
        input.website,
        input.address,
        input.city,
        input.country,
        input.taxId,
        input.categoryId,
        input.status,
        input.notes,
      ],
    );
    if (updated.length === 0) throw new AppError("not_found", "Client introuvable.");
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "customer.update",
      entityType: "customer",
      entityId: input.id,
      summary: `Modification du client « ${input.name} »`,
    });
  });
}

export async function deleteCustomer(
  context: { userId: string; organizationId: string },
  customerId: string,
): Promise<void> {
  await asMember(context, async (tx) => {
    const rows = await tx.query<{ name: string }>(
      `update customers set deleted_at = now()
       where id = $1 and organization_id = $2 and deleted_at is null returning name`,
      [customerId, context.organizationId],
    );
    if (rows.length === 0) throw new AppError("not_found", "Client introuvable.");
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "customer.delete",
      entityType: "customer",
      entityId: customerId,
      summary: `Suppression du client « ${rows[0]!.name} »`,
    });
  });
}

export async function addContact(
  context: { userId: string; organizationId: string },
  input: {
    customerId: string;
    fullName: string;
    roleTitle: string | null;
    email: string | null;
    phone: string | null;
    isPrimary: boolean;
  },
): Promise<void> {
  await asMember(context, async (tx) => {
    if (input.isPrimary) {
      await tx.query(
        "update customer_contacts set is_primary = false where customer_id = $1 and organization_id = $2",
        [input.customerId, context.organizationId],
      );
    }
    await tx.query(
      `insert into customer_contacts
        (organization_id, customer_id, full_name, role_title, email, phone, is_primary)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        context.organizationId,
        input.customerId,
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
      action: "customer.contact.create",
      entityType: "customer",
      entityId: input.customerId,
      summary: `Ajout du contact « ${input.fullName} »`,
    });
  });
}

export async function deleteContact(
  context: { userId: string; organizationId: string },
  contactId: string,
): Promise<void> {
  await asMember(context, async (tx) => {
    const rows = await tx.query<{ customer_id: string; full_name: string }>(
      `update customer_contacts set deleted_at = now()
       where id = $1 and organization_id = $2 and deleted_at is null
       returning customer_id, full_name`,
      [contactId, context.organizationId],
    );
    if (rows.length === 0) throw new AppError("not_found", "Contact introuvable.");
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "customer.contact.delete",
      entityType: "customer",
      entityId: rows[0]!.customer_id,
      summary: `Suppression du contact « ${rows[0]!.full_name} »`,
    });
  });
}

export async function addInteraction(
  context: { userId: string; organizationId: string },
  input: {
    customerId: string;
    type: string;
    subject: string;
    notes: string | null;
    occurredAt: string;
  },
): Promise<void> {
  await asMember(context, async (tx) => {
    await tx.query(
      `insert into customer_interactions
        (organization_id, customer_id, type, subject, notes, occurred_at, created_by)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        context.organizationId,
        input.customerId,
        input.type,
        input.subject,
        input.notes,
        input.occurredAt,
        context.userId,
      ],
    );
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "customer.interaction.create",
      entityType: "customer",
      entityId: input.customerId,
      summary: `Échange enregistré : ${input.subject}`,
    });
  });
}

export async function deleteInteraction(
  context: { userId: string; organizationId: string },
  interactionId: string,
): Promise<void> {
  await asMember(context, async (tx) => {
    const rows = await tx.query<{ id: string }>(
      "delete from customer_interactions where id = $1 and organization_id = $2 returning id",
      [interactionId, context.organizationId],
    );
    if (rows.length === 0) throw new AppError("not_found", "Échange introuvable.");
  });
}

export async function listCategories(
  context: { userId: string; organizationId: string },
): Promise<CategoryRow[]> {
  return asMember(context, (tx) =>
    tx.query<CategoryRow>(
      `select cat.id, cat.name, cat.color,
              (select count(*)::int from customers c
                where c.category_id = cat.id and c.deleted_at is null) as customers_count
       from customer_categories cat
       where cat.organization_id = $1
       order by cat.name asc`,
      [context.organizationId],
    ),
  );
}

export async function createCategory(
  context: { userId: string; organizationId: string },
  input: { name: string; color: string },
): Promise<void> {
  await asMember(context, async (tx) => {
    try {
      await tx.query(
        "insert into customer_categories (organization_id, name, color) values ($1,$2,$3)",
        [context.organizationId, input.name, input.color],
      );
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "23505") {
        throw new AppError("conflict", "Une catégorie porte déjà ce nom.");
      }
      throw error;
    }
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "customer.category.create",
      entityType: "customer_category",
      summary: `Création de la catégorie « ${input.name} »`,
    });
  });
}
