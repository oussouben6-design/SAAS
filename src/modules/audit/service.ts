import { asMember } from "@/lib/db";

export interface AuditRow {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  actor: string | null;
  actor_email: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export async function listAuditLogs(
  context: { userId: string; organizationId: string },
  filters: { q?: string; action?: string; page?: number; pageSize?: number },
): Promise<{ items: AuditRow[]; total: number; page: number; totalPages: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, filters.pageSize ?? 30));
  const q = filters.q?.trim() ? `%${filters.q.trim().toLowerCase()}%` : null;

  return asMember(context, async (tx) => {
    const items = await tx.query<AuditRow>(
      `select a.id, a.action, a.entity_type, a.entity_id, a.summary,
              p.full_name as actor, a.actor_email, a.metadata, a.created_at
       from audit_logs a left join profiles p on p.id = a.actor_id
       where a.organization_id = $1
         and ($2::text is null or lower(a.summary) like $2 or lower(a.action) like $2)
         and ($3::text is null or a.action = $3)
       order by a.created_at desc
       limit $4 offset $5`,
      [context.organizationId, q, filters.action || null, pageSize, (page - 1) * pageSize],
    );
    const counts = await tx.query<{ total: number }>(
      `select count(*)::int as total from audit_logs a
       where a.organization_id = $1
         and ($2::text is null or lower(a.summary) like $2 or lower(a.action) like $2)
         and ($3::text is null or a.action = $3)`,
      [context.organizationId, q, filters.action || null],
    );
    const total = counts[0]?.total ?? 0;
    return { items, total, page, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  });
}

export async function listAuditActions(
  context: { userId: string; organizationId: string },
): Promise<string[]> {
  const rows = await asMember(context, (tx) =>
    tx.query<{ action: string }>(
      "select distinct action from audit_logs where organization_id = $1 order by action asc",
      [context.organizationId],
    ),
  );
  return rows.map((row) => row.action);
}
