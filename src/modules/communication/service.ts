import { asMember } from "@/lib/db";
import { AppError } from "@/lib/server/errors";
import { recordAudit } from "@/lib/server/audit";

/**
 * Module Communication interne : annonces et calendrier partagé.
 * Aucune messagerie instantanée : elle est volontairement hors périmètre.
 */

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  audience: string;
  department_id: string | null;
  department_name: string | null;
  is_pinned: boolean;
  published_at: string;
  expires_at: string | null;
  author: string | null;
}

export async function listAnnouncements(
  context: { userId: string; organizationId: string },
  filters: { includeExpired?: boolean } = {},
): Promise<AnnouncementRow[]> {
  return asMember(context, async (tx) => {
    const rows = await tx.query<AnnouncementRow>(
      `select a.id, a.title, a.body, a.audience, a.department_id, d.name as department_name,
              a.is_pinned, a.published_at, a.expires_at, p.full_name as author
       from announcements a
       left join departments d on d.id = a.department_id
       left join profiles p on p.id = a.created_by
       where a.organization_id = $1 and a.deleted_at is null
         and ($2::boolean or a.expires_at is null or a.expires_at >= current_date)
         and (
           a.audience = 'all'
           or (a.audience = 'admins' and app.has_permission(a.organization_id, 'organization', 'administer'))
           or (a.audience = 'department' and exists (
             select 1 from organization_members m
             where m.organization_id = a.organization_id
               and m.user_id = app.current_user_id()
               and m.department_id = a.department_id
           ))
         )
       order by a.is_pinned desc, a.published_at desc
       limit 50`,
      [context.organizationId, filters.includeExpired === true],
    );
    return rows;
  });
}

export async function createAnnouncement(
  context: { userId: string; organizationId: string },
  input: {
    title: string;
    body: string;
    audience: string;
    departmentId: string | null;
    isPinned: boolean;
    expiresAt: string | null;
  },
): Promise<void> {
  if (input.audience === "department" && !input.departmentId) {
    throw new AppError("validation", "Choisissez le département destinataire de l'annonce.");
  }
  await asMember(context, async (tx) => {
    const rows = await tx.query<{ id: string }>(
      `insert into announcements (organization_id, title, body, audience, department_id, is_pinned, expires_at, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [
        context.organizationId,
        input.title,
        input.body,
        input.audience,
        input.audience === "department" ? input.departmentId : null,
        input.isPinned,
        input.expiresAt,
        context.userId,
      ],
    );
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "announcement.create",
      entityType: "announcement",
      entityId: rows[0]!.id,
      summary: `Publication de l'annonce « ${input.title} »`,
      metadata: { audience: input.audience },
    });
  });
}

export async function deleteAnnouncement(
  context: { userId: string; organizationId: string },
  announcementId: string,
): Promise<void> {
  await asMember(context, async (tx) => {
    const rows = await tx.query<{ title: string }>(
      "select title from announcements where id = $1 and organization_id = $2 and deleted_at is null",
      [announcementId, context.organizationId],
    );
    if (!rows[0]) throw new AppError("not_found", "Annonce introuvable.");
    await tx.query(
      "update announcements set deleted_at = now() where id = $1 and organization_id = $2",
      [announcementId, context.organizationId],
    );
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "announcement.delete",
      entityType: "announcement",
      entityId: announcementId,
      summary: `Suppression de l'annonce « ${rows[0].title} »`,
    });
  });
}

export interface EventRow {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  visibility: string;
  department_name: string | null;
  project_name: string | null;
  author: string | null;
}

export async function listEvents(
  context: { userId: string; organizationId: string },
  filters: { from?: string; to?: string } = {},
): Promise<EventRow[]> {
  return asMember(context, async (tx) => {
    const rows = await tx.query<EventRow>(
      `select e.id, e.title, e.description, e.starts_at, e.ends_at, e.all_day, e.location,
              e.visibility, d.name as department_name, pr.name as project_name, p.full_name as author
       from calendar_events e
       left join departments d on d.id = e.department_id
       left join projects pr on pr.id = e.project_id
       left join profiles p on p.id = e.created_by
       where e.organization_id = $1 and e.deleted_at is null
         and ($2::timestamp is null or e.starts_at >= $2::timestamp)
         and ($3::timestamp is null or e.starts_at <= $3::timestamp)
       order by e.starts_at asc
       limit 200`,
      [context.organizationId, filters.from ?? null, filters.to ?? null],
    );
    return rows;
  });
}

export async function createEvent(
  context: { userId: string; organizationId: string },
  input: {
    title: string;
    description: string | null;
    startsAt: string;
    endsAt: string | null;
    allDay: boolean;
    location: string | null;
    visibility: string;
    departmentId: string | null;
    projectId: string | null;
  },
): Promise<void> {
  if (input.endsAt && new Date(input.endsAt) < new Date(input.startsAt)) {
    throw new AppError("validation", "La fin de l'événement précède son début.");
  }
  await asMember(context, async (tx) => {
    const rows = await tx.query<{ id: string }>(
      `insert into calendar_events
        (organization_id, title, description, starts_at, ends_at, all_day, location, visibility,
         department_id, project_id, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
      [
        context.organizationId,
        input.title,
        input.description,
        input.startsAt,
        input.endsAt,
        input.allDay,
        input.location,
        input.visibility,
        input.departmentId,
        input.projectId,
        context.userId,
      ],
    );
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "calendar.create",
      entityType: "calendar_event",
      entityId: rows[0]!.id,
      summary: `Création de l'événement « ${input.title} »`,
      metadata: { startsAt: input.startsAt, visibility: input.visibility },
    });
  });
}

export async function deleteEvent(
  context: { userId: string; organizationId: string },
  eventId: string,
): Promise<void> {
  await asMember(context, async (tx) => {
    const rows = await tx.query<{ title: string }>(
      "select title from calendar_events where id = $1 and organization_id = $2 and deleted_at is null",
      [eventId, context.organizationId],
    );
    if (!rows[0]) throw new AppError("not_found", "Événement introuvable.");
    await tx.query(
      "update calendar_events set deleted_at = now() where id = $1 and organization_id = $2",
      [eventId, context.organizationId],
    );
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "calendar.delete",
      entityType: "calendar_event",
      entityId: eventId,
      summary: `Suppression de l'événement « ${rows[0].title} »`,
    });
  });
}
