import { asMember } from "@/lib/db";

export interface NotificationRow {
  id: string;
  title: string;
  body: string | null;
  type: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export async function listNotifications(
  context: { userId: string; organizationId: string },
  limit = 100,
): Promise<NotificationRow[]> {
  return asMember(context, (tx) =>
    tx.query<NotificationRow>(
      `select id, title, body, type, link, read_at, created_at
       from notifications where user_id = $1 and organization_id = $2
       order by created_at desc limit $3`,
      [context.userId, context.organizationId, Math.min(200, limit)],
    ),
  );
}

export async function countUnread(context: { userId: string; organizationId: string }): Promise<number> {
  const rows = await asMember(context, (tx) =>
    tx.query<{ count: number }>(
      "select count(*)::int as count from notifications where user_id = $1 and read_at is null",
      [context.userId],
    ),
  );
  return rows[0]?.count ?? 0;
}

export async function markNotificationRead(
  context: { userId: string; organizationId: string },
  notificationId: string,
): Promise<void> {
  await asMember(context, (tx) =>
    tx.query(
      "update notifications set read_at = now() where id = $1 and user_id = $2 and read_at is null",
      [notificationId, context.userId],
    ),
  );
}

export async function markAllRead(context: { userId: string; organizationId: string }): Promise<void> {
  await asMember(context, (tx) =>
    tx.query("update notifications set read_at = now() where user_id = $1 and read_at is null", [
      context.userId,
    ]),
  );
}
