import { asMember } from "@/lib/db";
import { AppError } from "@/lib/server/errors";
import { recordAudit, notify } from "@/lib/server/audit";

export const TASK_STATUSES = ["todo", "in_progress", "review", "done", "blocked"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "À faire",
  in_progress: "En cours",
  review: "En revue",
  done: "Terminée",
  blocked: "Bloquée",
};

export const TASK_PRIORITY_LABELS: Record<string, string> = {
  low: "Basse",
  medium: "Moyenne",
  high: "Haute",
  critical: "Critique",
};

export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: string;
  due_date: string | null;
  completed_at: string | null;
  position: number;
  project_id: string | null;
  project_name: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  created_at: string;
  subtasks_total: number;
  subtasks_done: number;
  comments_count: number;
}

export interface TaskFilters {
  q?: string;
  status?: string;
  assigneeId?: string;
  projectId?: string;
  view?: "list" | "board" | "calendar";
  overdueOnly?: boolean;
  limit?: number;
}

export async function listTasks(
  context: { userId: string; organizationId: string },
  filters: TaskFilters,
): Promise<TaskRow[]> {
  const q = filters.q?.trim() ? `%${filters.q.trim().toLowerCase()}%` : null;
  return asMember(context, (tx) =>
    tx.query<TaskRow>(
      `select t.id, t.title, t.description, t.status, t.priority, t.due_date, t.completed_at,
              t.position, t.project_id, pr.name as project_name, t.assignee_id,
              p.full_name as assignee_name, t.created_at,
              (select count(*)::int from tasks s where s.parent_task_id = t.id and s.deleted_at is null) as subtasks_total,
              (select count(*)::int from tasks s where s.parent_task_id = t.id and s.deleted_at is null and s.status = 'done') as subtasks_done,
              (select count(*)::int from task_comments c where c.task_id = t.id) as comments_count
       from tasks t
       left join projects pr on pr.id = t.project_id
       left join profiles p on p.id = t.assignee_id
       where t.organization_id = $1 and t.deleted_at is null and t.parent_task_id is null
         and ($2::text is null or lower(t.title) like $2 or lower(coalesce(t.description,'')) like $2)
         and ($3::text is null or t.status = $3)
         and ($4::uuid is null or t.assignee_id = $4)
         and ($5::uuid is null or t.project_id = $5)
         and ($6::boolean is not true or (t.status <> 'done' and t.due_date < current_date))
       order by
         case t.priority when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end,
         t.due_date asc nulls last, t.position asc
       limit $7`,
      [
        context.organizationId,
        q,
        filters.status || null,
        filters.assigneeId || null,
        filters.projectId || null,
        filters.overdueOnly ?? false,
        Math.min(300, filters.limit ?? 200),
      ],
    ),
  );
}

export async function getTask(
  context: { userId: string; organizationId: string },
  taskId: string,
): Promise<{
  task: TaskRow;
  subtasks: { id: string; title: string; status: TaskStatus; assignee_name: string | null }[];
  comments: { id: string; body: string; author: string | null; author_id: string | null; created_at: string }[];
  documents: { id: string; name: string; mime_type: string; created_at: string }[];
}> {
  return asMember(context, async (tx) => {
    const rows = await tx.query<TaskRow>(
      `select t.id, t.title, t.description, t.status, t.priority, t.due_date, t.completed_at,
              t.position, t.project_id, pr.name as project_name, t.assignee_id,
              p.full_name as assignee_name, t.created_at,
              0 as subtasks_total, 0 as subtasks_done, 0 as comments_count
       from tasks t
       left join projects pr on pr.id = t.project_id
       left join profiles p on p.id = t.assignee_id
       where t.id = $1 and t.organization_id = $2 and t.deleted_at is null`,
      [taskId, context.organizationId],
    );
    const task = rows[0];
    if (!task) throw new AppError("not_found", "Tâche introuvable.");

    const [subtasks, comments, documents] = await Promise.all([
      tx.query<{ id: string; title: string; status: TaskStatus; assignee_name: string | null }>(
        `select s.id, s.title, s.status, p.full_name as assignee_name
         from tasks s left join profiles p on p.id = s.assignee_id
         where s.parent_task_id = $1 and s.deleted_at is null order by s.created_at asc`,
        [taskId],
      ),
      tx.query<{
        id: string;
        body: string;
        author: string | null;
        author_id: string | null;
        created_at: string;
      }>(
        `select c.id, c.body, p.full_name as author, c.author_id, c.created_at
         from task_comments c left join profiles p on p.id = c.author_id
         where c.task_id = $1 order by c.created_at asc`,
        [taskId],
      ),
      tx.query<{ id: string; name: string; mime_type: string; created_at: string }>(
        `select id, name, mime_type, created_at from documents
         where organization_id = $1 and entity_type = 'task' and entity_id = $2 and deleted_at is null`,
        [context.organizationId, taskId],
      ),
    ]);

    return { task, subtasks, comments, documents };
  });
}

export async function createTask(
  context: { userId: string; organizationId: string },
  input: {
    title: string;
    description: string | null;
    projectId: string | null;
    parentTaskId: string | null;
    assigneeId: string | null;
    status: TaskStatus;
    priority: string;
    dueDate: string | null;
  },
): Promise<string> {
  return asMember(context, async (tx) => {
    const rows = await tx.query<{ id: string }>(
      `insert into tasks
        (organization_id, project_id, parent_task_id, title, description, status, priority,
         assignee_id, due_date, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       returning id`,
      [
        context.organizationId,
        input.projectId,
        input.parentTaskId,
        input.title,
        input.description,
        input.status,
        input.priority,
        input.assigneeId,
        input.dueDate,
        context.userId,
      ],
    );
    const id = rows[0]!.id;

    if (input.assigneeId && input.assigneeId !== context.userId) {
      await notify(tx, {
        organizationId: context.organizationId,
        userId: input.assigneeId,
        title: "Nouvelle tâche assignée",
        body: input.title,
        link: `/app/taches?task=${id}`,
        type: "info",
      });
    }

    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "task.create",
      entityType: "task",
      entityId: id,
      summary: `Création de la tâche « ${input.title} »`,
    });
    return id;
  });
}

export async function updateTask(
  context: { userId: string; organizationId: string },
  input: {
    id: string;
    title: string;
    description: string | null;
    projectId: string | null;
    assigneeId: string | null;
    status: TaskStatus;
    priority: string;
    dueDate: string | null;
    position?: number;
  },
): Promise<void> {
  await asMember(context, async (tx) => {
    const previous = await tx.query<{ assignee_id: string | null; title: string }>(
      "select assignee_id, title from tasks where id = $1 and organization_id = $2 and deleted_at is null",
      [input.id, context.organizationId],
    );
    if (previous.length === 0) throw new AppError("not_found", "Tâche introuvable.");

    const updated = await tx.query<{ id: string }>(
      `update tasks set
         title = $3, description = $4, project_id = $5, assignee_id = $6, status = $7,
         priority = $8, due_date = $9, position = coalesce($10, position),
         completed_at = case when $7 = 'done' then coalesce(completed_at, now()) else null end
       where id = $1 and organization_id = $2 and deleted_at is null returning id`,
      [
        input.id,
        context.organizationId,
        input.title,
        input.description,
        input.projectId,
        input.assigneeId,
        input.status,
        input.priority,
        input.dueDate,
        input.position ?? null,
      ],
    );
    if (updated.length === 0) throw new AppError("not_found", "Tâche introuvable.");

    if (
      input.assigneeId &&
      input.assigneeId !== previous[0]?.assignee_id &&
      input.assigneeId !== context.userId
    ) {
      await notify(tx, {
        organizationId: context.organizationId,
        userId: input.assigneeId,
        title: "Tâche qui vous est assignée",
        body: input.title,
        link: `/app/taches?task=${input.id}`,
        type: "info",
      });
    }

    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "task.update",
      entityType: "task",
      entityId: input.id,
      summary: `Mise à jour de la tâche « ${input.title} »`,
      metadata: { status: input.status },
    });
  });
}

export async function updateTaskStatus(
  context: { userId: string; organizationId: string },
  input: { id: string; status: TaskStatus; position?: number },
): Promise<void> {
  await asMember(context, async (tx) => {
    const rows = await tx.query<{ title: string }>(
      `update tasks set status = $3,
         completed_at = case when $3 = 'done' then coalesce(completed_at, now()) else null end,
         position = coalesce($4, position)
       where id = $1 and organization_id = $2 and deleted_at is null returning title`,
      [input.id, context.organizationId, input.status, input.position ?? null],
    );
    if (rows.length === 0) throw new AppError("not_found", "Tâche introuvable.");
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "task.status",
      entityType: "task",
      entityId: input.id,
      summary: `Statut de « ${rows[0]!.title} » → ${TASK_STATUS_LABELS[input.status]}`,
    });
  });
}

export async function deleteTask(
  context: { userId: string; organizationId: string },
  taskId: string,
): Promise<void> {
  await asMember(context, async (tx) => {
    const rows = await tx.query<{ title: string }>(
      `update tasks set deleted_at = now()
       where id = $1 and organization_id = $2 and deleted_at is null returning title`,
      [taskId, context.organizationId],
    );
    if (rows.length === 0) throw new AppError("not_found", "Tâche introuvable.");
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "task.delete",
      entityType: "task",
      entityId: taskId,
      summary: `Suppression de la tâche « ${rows[0]!.title} »`,
    });
  });
}

export async function addComment(
  context: { userId: string; organizationId: string },
  input: { taskId: string; body: string },
): Promise<void> {
  await asMember(context, async (tx) => {
    const task = await tx.query<{ id: string; assignee_id: string | null; title: string }>(
      "select id, assignee_id, title from tasks where id = $1 and organization_id = $2 and deleted_at is null",
      [input.taskId, context.organizationId],
    );
    if (task.length === 0) throw new AppError("not_found", "Tâche introuvable.");
    await tx.query(
      "insert into task_comments (organization_id, task_id, author_id, body) values ($1,$2,$3,$4)",
      [context.organizationId, input.taskId, context.userId, input.body],
    );
    if (task[0]!.assignee_id && task[0]!.assignee_id !== context.userId) {
      await notify(tx, {
        organizationId: context.organizationId,
        userId: task[0]!.assignee_id,
        title: "Nouveau commentaire",
        body: task[0]!.title,
        link: `/app/taches?task=${input.taskId}`,
        type: "info",
      });
    }
  });
}

export async function deleteComment(
  context: { userId: string; organizationId: string },
  commentId: string,
): Promise<void> {
  await asMember(context, async (tx) => {
    const rows = await tx.query<{ id: string; author_id: string | null }>(
      "delete from task_comments where id = $1 and organization_id = $2 returning id, author_id",
      [commentId, context.organizationId],
    );
    if (rows.length === 0) throw new AppError("not_found", "Commentaire introuvable.");
  });
}

export async function listAssignableMembers(
  context: { userId: string; organizationId: string },
): Promise<{ user_id: string; full_name: string; email: string }[]> {
  return asMember(context, (tx) =>
    tx.query<{ user_id: string; full_name: string; email: string }>(
      `select m.user_id, p.full_name, p.email
       from organization_members m join profiles p on p.id = m.user_id
       where m.organization_id = $1 and m.status = 'active'
       order by p.full_name asc`,
      [context.organizationId],
    ),
  );
}
