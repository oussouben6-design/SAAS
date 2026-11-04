import { asMember } from "@/lib/db";
import { AppError } from "@/lib/server/errors";
import { recordAudit } from "@/lib/server/audit";

export const LEAD_STATUS_LABELS: Record<string, string> = {
  new: "Nouveau",
  contacted: "Contacté",
  qualified: "Qualifié",
  unqualified: "Non qualifié",
  converted: "Converti",
};

export const LEAD_SOURCE_LABELS: Record<string, string> = {
  direct: "Direct",
  referral: "Recommandation",
  website: "Site web",
  social: "Réseaux sociaux",
  event: "Événement",
  call: "Appel entrant",
  other: "Autre",
};

export interface LeadRow {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  source: string;
  status: string;
  owner_name: string | null;
  next_follow_up_at: string | null;
  notes: string | null;
  converted_customer_id: string | null;
  created_at: string;
}

export interface StageRow {
  id: string;
  name: string;
  position: number;
  probability: number;
  is_won: boolean;
  is_lost: boolean;
}

export interface OpportunityRow {
  id: string;
  name: string;
  stage_id: string;
  stage_name: string;
  customer_name: string | null;
  amount_minor: string;
  currency: string;
  probability: number;
  expected_close_date: string | null;
  owner_name: string | null;
  status: string;
}

export async function listLeads(
  context: { userId: string; organizationId: string },
  filters: { q?: string; status?: string },
): Promise<LeadRow[]> {
  const q = filters.q?.trim() ? `%${filters.q.trim().toLowerCase()}%` : null;
  return asMember(context, (tx) =>
    tx.query<LeadRow>(
      `select l.id, l.name, l.company, l.email, l.phone, l.source, l.status,
              p.full_name as owner_name, l.next_follow_up_at, l.notes,
              l.converted_customer_id, l.created_at
       from leads l left join profiles p on p.id = l.owner_id
       where l.organization_id = $1 and l.deleted_at is null
         and ($2::text is null or lower(l.name) like $2 or lower(coalesce(l.company,'')) like $2 or lower(coalesce(l.email,'')) like $2)
         and ($3::text is null or l.status = $3)
       order by l.created_at desc limit 200`,
      [context.organizationId, q, filters.status || null],
    ),
  );
}

export async function createLead(
  context: { userId: string; organizationId: string },
  input: {
    name: string;
    company: string | null;
    email: string | null;
    phone: string | null;
    source: string;
    status: string;
    notes: string | null;
    nextFollowUpAt: string | null;
    ownerId: string | null;
  },
): Promise<string> {
  return asMember(context, async (tx) => {
    const rows = await tx.query<{ id: string }>(
      `insert into leads
        (organization_id, name, company, email, phone, source, status, notes,
         next_follow_up_at, owner_id, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
      [
        context.organizationId,
        input.name,
        input.company,
        input.email,
        input.phone,
        input.source,
        input.status,
        input.notes,
        input.nextFollowUpAt,
        input.ownerId,
        context.userId,
      ],
    );
    const id = rows[0]!.id;
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "lead.create",
      entityType: "lead",
      entityId: id,
      summary: `Création du prospect « ${input.name} »`,
    });
    return id;
  });
}

export async function updateLead(
  context: { userId: string; organizationId: string },
  input: {
    id: string;
    name: string;
    company: string | null;
    email: string | null;
    phone: string | null;
    source: string;
    status: string;
    notes: string | null;
    nextFollowUpAt: string | null;
    ownerId: string | null;
  },
): Promise<void> {
  await asMember(context, async (tx) => {
    const rows = await tx.query<{ id: string }>(
      `update leads set name=$3, company=$4, email=$5, phone=$6, source=$7, status=$8, notes=$9,
         next_follow_up_at=$10, owner_id=$11
       where id=$1 and organization_id=$2 and deleted_at is null returning id`,
      [
        input.id,
        context.organizationId,
        input.name,
        input.company,
        input.email,
        input.phone,
        input.source,
        input.status,
        input.notes,
        input.nextFollowUpAt,
        input.ownerId,
      ],
    );
    if (rows.length === 0) throw new AppError("not_found", "Prospect introuvable.");
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "lead.update",
      entityType: "lead",
      entityId: input.id,
      summary: `Modification du prospect « ${input.name} »`,
    });
  });
}

export async function updateLeadStatus(
  context: { userId: string; organizationId: string },
  input: { id: string; status: string },
): Promise<void> {
  await asMember(context, async (tx) => {
    const rows = await tx.query<{ name: string }>(
      `update leads set status = $3
       where id = $1 and organization_id = $2 and deleted_at is null returning name`,
      [input.id, context.organizationId, input.status],
    );
    if (rows.length === 0) throw new AppError("not_found", "Prospect introuvable.");
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "lead.status",
      entityType: "lead",
      entityId: input.id,
      summary: `Statut du prospect « ${rows[0]!.name} » → ${input.status}`,
    });
  });
}

export async function deleteLead(
  context: { userId: string; organizationId: string },
  leadId: string,
): Promise<void> {
  await asMember(context, async (tx) => {
    const rows = await tx.query<{ name: string }>(
      `update leads set deleted_at = now()
       where id = $1 and organization_id = $2 and deleted_at is null returning name`,
      [leadId, context.organizationId],
    );
    if (rows.length === 0) throw new AppError("not_found", "Prospect introuvable.");
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "lead.delete",
      entityType: "lead",
      entityId: leadId,
      summary: `Suppression du prospect « ${rows[0]!.name} »`,
    });
  });
}

export async function convertLeadToCustomer(
  context: { userId: string; organizationId: string },
  leadId: string,
): Promise<{ customerId: string }> {
  return asMember(context, async (tx) => {
    const rows = await tx.query<{
      id: string;
      name: string;
      company: string | null;
      email: string | null;
      phone: string | null;
      status: string;
      converted_customer_id: string | null;
    }>(
      `select id, name, company, email, phone, status, converted_customer_id from leads
       where id = $1 and organization_id = $2 and deleted_at is null`,
      [leadId, context.organizationId],
    );
    const lead = rows[0];
    if (!lead) throw new AppError("not_found", "Prospect introuvable.");
    if (lead.converted_customer_id) {
      throw new AppError("conflict", "Ce prospect a déjà été converti en client.");
    }

    const customer = await tx.query<{ id: string }>(
      `insert into customers (organization_id, name, email, phone, status, owner_id, created_by, notes)
       values ($1,$2,$3,$4,'active',$5,$5,$6) returning id`,
      [
        context.organizationId,
        (lead.company || lead.name).trim(),
        lead.email,
        lead.phone,
        context.userId,
        `Converti depuis le prospect « ${lead.name} »`,
      ],
    );
    const customerId = customer[0]!.id;

    await tx.query(
      "update leads set status = 'converted', converted_customer_id = $2, converted_at = now() where id = $1",
      [leadId, customerId],
    );
    await tx.query(
      `insert into customer_interactions (organization_id, customer_id, type, subject, notes, created_by)
       values ($1,$2,'note','Conversion du prospect',$3,$4)`,
      [context.organizationId, customerId, `Prospect d'origine : ${lead.name}`, context.userId],
    );
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "lead.convert",
      entityType: "lead",
      entityId: leadId,
      summary: `Prospect « ${lead.name} » converti en client`,
      metadata: { customerId },
    });
    return { customerId };
  });
}

export async function listStages(
  context: { userId: string; organizationId: string },
): Promise<StageRow[]> {
  return asMember(context, (tx) =>
    tx.query<StageRow>(
      "select id, name, position, probability, is_won, is_lost from pipeline_stages where organization_id = $1 order by position asc",
      [context.organizationId],
    ),
  );
}

export async function listOpportunities(
  context: { userId: string; organizationId: string },
): Promise<OpportunityRow[]> {
  return asMember(context, (tx) =>
    tx.query<OpportunityRow>(
      `select o.id, o.name, o.stage_id, s.name as stage_name, c.name as customer_name,
              o.amount_minor::text as amount_minor, o.currency, o.probability,
              o.expected_close_date, p.full_name as owner_name, o.status
       from opportunities o
       join pipeline_stages s on s.id = o.stage_id
       left join customers c on c.id = o.customer_id
       left join profiles p on p.id = o.owner_id
       where o.organization_id = $1 and o.deleted_at is null
       order by o.created_at desc limit 200`,
      [context.organizationId],
    ),
  );
}

export async function createOpportunity(
  context: { userId: string; organizationId: string },
  input: {
    name: string;
    customerId: string | null;
    leadId: string | null;
    stageId: string;
    amountMinor: number;
    probability: number;
    expectedCloseDate: string | null;
    ownerId: string | null;
    notes: string | null;
  },
): Promise<string> {
  return asMember(context, async (tx) => {
    const currency = await tx.query<{ currency: string }>(
      "select currency from organizations where id = $1",
      [context.organizationId],
    );
    const rows = await tx.query<{ id: string }>(
      `insert into opportunities
        (organization_id, name, customer_id, lead_id, stage_id, amount_minor, currency, probability,
         expected_close_date, owner_id, notes, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
      [
        context.organizationId,
        input.name,
        input.customerId,
        input.leadId,
        input.stageId,
        input.amountMinor,
        currency[0]?.currency ?? "XOF",
        input.probability,
        input.expectedCloseDate,
        input.ownerId,
        input.notes,
        context.userId,
      ],
    );
    const id = rows[0]!.id;
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "opportunity.create",
      entityType: "opportunity",
      entityId: id,
      summary: `Création de l'opportunité « ${input.name} »`,
    });
    return id;
  });
}

export async function moveOpportunity(
  context: { userId: string; organizationId: string },
  input: { id: string; stageId: string },
): Promise<void> {
  await asMember(context, async (tx) => {
    const stage = await tx.query<{ probability: number; is_won: boolean; is_lost: boolean; name: string }>(
      "select probability, is_won, is_lost, name from pipeline_stages where id = $1 and organization_id = $2",
      [input.stageId, context.organizationId],
    );
    if (stage.length === 0) throw new AppError("not_found", "Étape introuvable.");
    const status = stage[0]!.is_won ? "won" : stage[0]!.is_lost ? "lost" : "open";
    const rows = await tx.query<{ name: string }>(
      `update opportunities set stage_id = $3, probability = $4, status = $5
       where id = $1 and organization_id = $2 and deleted_at is null returning name`,
      [input.id, context.organizationId, input.stageId, stage[0]!.probability, status],
    );
    if (rows.length === 0) throw new AppError("not_found", "Opportunité introuvable.");
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "opportunity.stage",
      entityType: "opportunity",
      entityId: input.id,
      summary: `« ${rows[0]!.name} » déplacée vers « ${stage[0]!.name} »`,
    });
  });
}

export async function deleteOpportunity(
  context: { userId: string; organizationId: string },
  opportunityId: string,
): Promise<void> {
  await asMember(context, async (tx) => {
    const rows = await tx.query<{ name: string }>(
      `update opportunities set deleted_at = now()
       where id = $1 and organization_id = $2 and deleted_at is null returning name`,
      [opportunityId, context.organizationId],
    );
    if (rows.length === 0) throw new AppError("not_found", "Opportunité introuvable.");
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "opportunity.delete",
      entityType: "opportunity",
      entityId: opportunityId,
      summary: `Suppression de l'opportunité « ${rows[0]!.name} »`,
    });
  });
}
