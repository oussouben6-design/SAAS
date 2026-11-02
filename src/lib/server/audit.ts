import type { SqlExecutor } from "@/lib/db";

export interface AuditEntry {
  organizationId: string | null;
  actorId: string | null;
  actorEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

/** Journalise une opération sensible dans la même transaction que la modification. */
export async function recordAudit(tx: SqlExecutor, entry: AuditEntry): Promise<void> {
  await tx.query(
    `insert into audit_logs
      (organization_id, actor_id, actor_email, action, entity_type, entity_id, summary, metadata, ip, user_agent)
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)`,
    [
      entry.organizationId,
      entry.actorId,
      entry.actorEmail ?? null,
      entry.action,
      entry.entityType,
      entry.entityId ?? null,
      entry.summary,
      JSON.stringify(entry.metadata ?? {}),
      entry.ip ?? null,
      entry.userAgent ?? null,
    ],
  );
}

export async function notify(
  tx: SqlExecutor,
  input: {
    organizationId: string;
    userId: string;
    title: string;
    body?: string | null;
    link?: string | null;
    type?: string;
  },
): Promise<void> {
  await tx.query(
    `insert into notifications (organization_id, user_id, type, title, body, link)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      input.organizationId,
      input.userId,
      input.type ?? "info",
      input.title,
      input.body ?? null,
      input.link ?? null,
    ],
  );
}
