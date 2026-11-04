import { asMember } from "@/lib/db";
import { AppError } from "@/lib/server/errors";
import { recordAudit } from "@/lib/server/audit";

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  planning: "Planification",
  active: "En cours",
  on_hold: "En pause",
  completed: "Terminé",
  cancelled: "Annulé",
};

export const PRIORITY_LABELS: Record<string, string> = {
  low: "Basse",
  medium: "Moyenne",
  high: "Haute",
  critical: "Critique",
};

export interface ProjectListItem {
  id: string;
  name: string;
  code: string | null;
  status: string;
  priority: string;
  start_date: string | null;
  end_date: string | null;
  budget_minor: string;
  currency: string;
  progress: number;
  manager_name: string | null;
  customer_name: string | null;
  tasks_total: number;
  tasks_done: number;
}

export interface ProjectDetail extends Omit<ProjectListItem, "tasks_total" | "tasks_done"> {
  description: string | null;
  objectives: string | null;
  manager_id: string | null;
  customer_id: string | null;
  department_id: string | null;
  department_name: string | null;
  created_at: string;
}

export interface MilestoneRow {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  completed_at: string | null;
  position: number;
}

export interface ProjectMemberRow {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
}

export async function listProjects(
  context: { userId: string; organizationId: string },
  filters: { q?: string; status?: string; page?: number; pageSize?: number },
): Promise<{ items: ProjectListItem[]; total: number; page: number; totalPages: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(50, Math.max(5, filters.pageSize ?? 20));
  const q = filters.q?.trim() ? `%${filters.q.trim().toLowerCase()}%` : null;

  return asMember(context, async (tx) => {
    const items = await tx.query<ProjectListItem>(
      `select pr.id, pr.name, pr.code, pr.status, pr.priority, pr.start_date, pr.end_date,
              pr.budget_minor::text as budget_minor, pr.currency, pr.progress,
              m.full_name as manager_name, c.name as customer_name,
              (select count(*)::int from tasks t
                where t.project_id = pr.id and t.deleted_at is null) as tasks_total,
              (select count(*)::int from tasks t
                where t.project_id = pr.id and t.deleted_at is null and t.status = 'done') as tasks_done
       from projects pr
       left join profiles m on m.id = pr.manager_id
       left join customers c on c.id = pr.customer_id
       where pr.organization_id = $1 and pr.deleted_at is null
         and ($2::text is null or lower(pr.name) like $2 or lower(coalesce(pr.code, '')) like $2)
         and ($3::text is null or pr.status = $3)
       order by pr.created_at desc
       limit $4 offset $5`,
      [context.organizationId, q, filters.status || null, pageSize, (page - 1) * pageSize],
    );
    const counts = await tx.query<{ total: number }>(
      `select count(*)::int as total from projects pr
       where pr.organization_id = $1 and pr.deleted_at is null
         and ($2::text is null or lower(pr.name) like $2 or lower(coalesce(pr.code, '')) like $2)
         and ($3::text is null or pr.status = $3)`,
      [context.organizationId, q, filters.status || null],
    );
    const total = counts[0]?.total ?? 0;
    return { items, total, page, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  });
}

export async function getProject(
  context: { userId: string; organizationId: string },
  projectId: string,
): Promise<{
  project: ProjectDetail;
  milestones: MilestoneRow[];
  members: ProjectMemberRow[];
  tasks: {
    id: string;
    title: string;
    status: string;
    priority: string;
    due_date: string | null;
    assignee_name: string | null;
  }[];
  documents: { id: string; name: string; mime_type: string; created_at: string }[];
}> {
  return asMember(context, async (tx) => {
    const rows = await tx.query<ProjectDetail>(
      `select pr.*, pr.budget_minor::text as budget_minor, m.full_name as manager_name,
              c.name as customer_name, d.name as department_name
       from projects pr
       left join profiles m on m.id = pr.manager_id
       left join customers c on c.id = pr.customer_id
       left join departments d on d.id = pr.department_id
       where pr.id = $1 and pr.organization_id = $2 and pr.deleted_at is null`,
      [projectId, context.organizationId],
    );
    const project = rows[0];
    if (!project) throw new AppError("not_found", "Projet introuvable.");

    const [milestones, members, tasks, documents] = await Promise.all([
      tx.query<MilestoneRow>(
        `select id, title, description, due_date, completed_at, position
         from project_milestones where project_id = $1 order by position asc, due_date asc`,
        [projectId],
      ),
      tx.query<ProjectMemberRow>(
        `select pm.user_id, p.full_name, p.email, pm.role
         from project_members pm join profiles p on p.id = pm.user_id
         where pm.project_id = $1 order by pm.role asc, p.full_name asc`,
        [projectId],
      ),
      tx.query<{
        id: string;
        title: string;
        status: string;
        priority: string;
        due_date: string | null;
        assignee_name: string | null;
      }>(
        `select t.id, t.title, t.status, t.priority, t.due_date, p.full_name as assignee_name
         from tasks t left join profiles p on p.id = t.assignee_id
         where t.project_id = $1 and t.deleted_at is null
         order by t.position asc, t.created_at desc`,
        [projectId],
      ),
      tx.query<{ id: string; name: string; mime_type: string; created_at: string }>(
        `select id, name, mime_type, created_at from documents
         where organization_id = $1 and entity_type = 'project' and entity_id = $2 and deleted_at is null
         order by created_at desc`,
        [context.organizationId, projectId],
      ),
    ]);

    return { project, milestones, members, tasks, documents };
  });
}

export async function createProject(
  context: { userId: string; organizationId: string },
  input: {
    name: string;
    code: string | null;
    description: string | null;
    objectives: string | null;
    customerId: string | null;
    departmentId: string | null;
    managerId: string | null;
    status: string;
    priority: string;
    startDate: string | null;
    endDate: string | null;
    budgetMinor: number;
  },
): Promise<string> {
  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    throw new AppError("validation", "La date de fin doit être postérieure à la date de début.");
  }
  return asMember(context, async (tx) => {
    const rows = await tx.query<{ id: string }>(
      `insert into projects
        (organization_id, name, code, description, objectives, customer_id, department_id, manager_id,
         status, priority, start_date, end_date, budget_minor, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       returning id`,
      [
        context.organizationId,
        input.name,
        input.code,
        input.description,
        input.objectives,
        input.customerId,
        input.departmentId,
        input.managerId,
        input.status,
        input.priority,
        input.startDate,
        input.endDate,
        input.budgetMinor,
        context.userId,
      ],
    );
    const id = rows[0]!.id;
    if (input.managerId) {
      await tx.query(
        `insert into project_members (project_id, user_id, role) values ($1, $2, 'manager')
         on conflict (project_id, user_id) do update set role = 'manager'`,
        [id, input.managerId],
      );
    }
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "project.create",
      entityType: "project",
      entityId: id,
      summary: `Création du projet « ${input.name} »`,
    });
    return id;
  });
}

export async function updateProject(
  context: { userId: string; organizationId: string },
  input: {
    id: string;
    name: string;
    code: string | null;
    description: string | null;
    objectives: string | null;
    customerId: string | null;
    departmentId: string | null;
    managerId: string | null;
    status: string;
    priority: string;
    startDate: string | null;
    endDate: string | null;
    budgetMinor: number;
    progress: number;
  },
): Promise<void> {
  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    throw new AppError("validation", "La date de fin doit être postérieure à la date de début.");
  }
  await asMember(context, async (tx) => {
    const rows = await tx.query<{ id: string }>(
      `update projects set
         name=$3, code=$4, description=$5, objectives=$6, customer_id=$7, department_id=$8,
         manager_id=$9, status=$10, priority=$11, start_date=$12, end_date=$13, budget_minor=$14,
         progress=$15
       where id=$1 and organization_id=$2 and deleted_at is null returning id`,
      [
        input.id,
        context.organizationId,
        input.name,
        input.code,
        input.description,
        input.objectives,
        input.customerId,
        input.departmentId,
        input.managerId,
        input.status,
        input.priority,
        input.startDate,
        input.endDate,
        input.budgetMinor,
        input.progress,
      ],
    );
    if (rows.length === 0) throw new AppError("not_found", "Projet introuvable.");
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "project.update",
      entityType: "project",
      entityId: input.id,
      summary: `Modification du projet « ${input.name} »`,
    });
  });
}

export async function deleteProject(
  context: { userId: string; organizationId: string },
  projectId: string,
): Promise<void> {
  await asMember(context, async (tx) => {
    const rows = await tx.query<{ name: string }>(
      `update projects set deleted_at = now()
       where id = $1 and organization_id = $2 and deleted_at is null returning name`,
      [projectId, context.organizationId],
    );
    if (rows.length === 0) throw new AppError("not_found", "Projet introuvable.");
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "project.delete",
      entityType: "project",
      entityId: projectId,
      summary: `Suppression du projet « ${rows[0]!.name} »`,
    });
  });
}

export async function addMilestone(
  context: { userId: string; organizationId: string },
  input: { projectId: string; title: string; dueDate: string | null; description: string | null },
): Promise<void> {
  await asMember(context, async (tx) => {
    const position = await tx.query<{ next: number }>(
      "select coalesce(max(position), 0) + 10 as next from project_milestones where project_id = $1",
      [input.projectId],
    );
    await tx.query(
      `insert into project_milestones (organization_id, project_id, title, description, due_date, position)
       values ($1,$2,$3,$4,$5,$6)`,
      [
        context.organizationId,
        input.projectId,
        input.title,
        input.description,
        input.dueDate,
        position[0]?.next ?? 10,
      ],
    );
  });
}

export async function toggleMilestone(
  context: { userId: string; organizationId: string },
  milestoneId: string,
): Promise<void> {
  await asMember(context, async (tx) => {
    const rows = await tx.query<{ id: string }>(
      `update project_milestones
       set completed_at = case when completed_at is null then now() else null end
       where id = $1 and organization_id = $2 returning id`,
      [milestoneId, context.organizationId],
    );
    if (rows.length === 0) throw new AppError("not_found", "Jalon introuvable.");
  });
}

export async function deleteMilestone(
  context: { userId: string; organizationId: string },
  milestoneId: string,
): Promise<void> {
  await asMember(context, async (tx) => {
    const rows = await tx.query<{ id: string }>(
      "delete from project_milestones where id = $1 and organization_id = $2 returning id",
      [milestoneId, context.organizationId],
    );
    if (rows.length === 0) throw new AppError("not_found", "Jalon introuvable.");
  });
}

export async function addProjectMember(
  context: { userId: string; organizationId: string },
  input: { projectId: string; userId: string; role: string },
): Promise<void> {
  await asMember(context, async (tx) => {
    await tx.query(
      `insert into project_members (project_id, user_id, role) values ($1,$2,$3)
       on conflict (project_id, user_id) do update set role = excluded.role`,
      [input.projectId, input.userId, input.role],
    );
  });
}

export async function removeProjectMember(
  context: { userId: string; organizationId: string },
  input: { projectId: string; userId: string },
): Promise<void> {
  await asMember(context, async (tx) => {
    await tx.query("delete from project_members where project_id = $1 and user_id = $2", [
      input.projectId,
      input.userId,
    ]);
  });
}
