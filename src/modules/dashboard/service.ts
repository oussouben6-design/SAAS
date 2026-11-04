import { asMember } from "@/lib/db";

export type DashboardPeriod = "7d" | "30d" | "90d" | "12m" | "all";

export const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  "7d": "7 derniers jours",
  "30d": "30 derniers jours",
  "90d": "90 derniers jours",
  "12m": "12 derniers mois",
  all: "Depuis le début",
};

export function periodToInterval(period: DashboardPeriod): string | null {
  switch (period) {
    case "7d":
      return "7 days";
    case "30d":
      return "30 days";
    case "90d":
      return "90 days";
    case "12m":
      return "12 months";
    default:
      return null;
  }
}

export interface DashboardData {
  projects: { total: number; active: number; completed: number };
  tasks: { total: number; overdue: number; done: number; todo: number; inProgress: number };
  customers: { total: number; newInPeriod: number };
  leads: { total: number; newInPeriod: number };
  opportunities: { open: number; amountMinor: string; wonInPeriod: number };
  finance: {
    revenueMinor: string;
    expenseMinor: string;
    unpaidMinor: string;
    unpaidCount: number;
    canRead: boolean;
  };
  recentActivity: {
    id: string;
    summary: string;
    action: string;
    actor: string | null;
    createdAt: string;
  }[];
  upcoming: { id: string; title: string; dueDate: string; kind: "task" | "milestone" | "event"; status?: string }[];
  tasksByStatus: { status: string; count: number }[];
  monthlyFinance: { month: string; revenue: number; expense: number }[];
  workload: { name: string; open: number; overdue: number }[];
}

export async function getDashboard(
  context: { userId: string; organizationId: string },
  period: DashboardPeriod,
  options: { canReadFinance: boolean; canReadAudit: boolean },
): Promise<DashboardData> {
  const interval = periodToInterval(period);

  return asMember(context, async (tx) => {
    const orgId = context.organizationId;

    const projects = await tx.query<{ total: number; active: number; completed: number }>(
      `select
         count(*)::int as total,
         count(*) filter (where status = 'active')::int as active,
         count(*) filter (where status = 'completed')::int as completed
       from projects where organization_id = $1 and deleted_at is null`,
      [orgId],
    );

    const tasks = await tx.query<{
      total: number;
      overdue: number;
      done: number;
      todo: number;
      in_progress: number;
    }>(
      `select
         count(*)::int as total,
         count(*) filter (where status <> 'done' and due_date is not null and due_date < current_date)::int as overdue,
         count(*) filter (where status = 'done')::int as done,
         count(*) filter (where status = 'todo')::int as todo,
         count(*) filter (where status = 'in_progress')::int as in_progress
       from tasks where organization_id = $1 and deleted_at is null`,
      [orgId],
    );

    const customers = await tx.query<{ total: number; new_in_period: number }>(
      `select count(*)::int as total,
              count(*) filter (where $2::interval is null or created_at >= now() - $2::interval)::int as new_in_period
       from customers where organization_id = $1 and deleted_at is null`,
      [orgId, interval],
    );

    const leads = await tx.query<{ total: number; new_in_period: number }>(
      `select count(*)::int as total,
              count(*) filter (where $2::interval is null or created_at >= now() - $2::interval)::int as new_in_period
       from leads where organization_id = $1 and deleted_at is null`,
      [orgId, interval],
    );

    const opportunities = await tx.query<{
      open_count: number;
      amount_minor: string;
      won_in_period: number;
    }>(
      `select count(*) filter (where status = 'open')::int as open_count,
              coalesce(sum(amount_minor) filter (where status = 'open'), 0)::text as amount_minor,
              count(*) filter (where status = 'won' and ($2::interval is null or updated_at >= now() - $2::interval))::int as won_in_period
       from opportunities where organization_id = $1 and deleted_at is null`,
      [orgId, interval],
    );

    const tasksByStatus = await tx.query<{ status: string; count: number }>(
      `select status, count(*)::int as count from tasks
       where organization_id = $1 and deleted_at is null group by status`,
      [orgId],
    );

    const upcomingTasks = await tx.query<{
      id: string;
      title: string;
      due_date: string;
      status: string;
    }>(
      `select id, title, due_date, status from tasks
       where organization_id = $1 and deleted_at is null and status <> 'done' and due_date is not null
         and due_date <= current_date + interval '30 days'
       order by due_date asc limit 6`,
      [orgId],
    );

    const upcomingMilestones = await tx.query<{ id: string; title: string; due_date: string }>(
      `select id, title, due_date from project_milestones
       where organization_id = $1 and completed_at is null and due_date is not null
         and due_date <= current_date + interval '30 days'
       order by due_date asc limit 6`,
      [orgId],
    );

    const upcomingEvents = await tx.query<{ id: string; title: string; starts_at: string }>(
      `select id, title, starts_at from calendar_events
       where organization_id = $1 and deleted_at is null and visibility = 'organization'
         and starts_at >= now() - interval '1 day' and starts_at <= now() + interval '30 days'
       order by starts_at asc limit 5`,
      [orgId],
    );

    const activity = options.canReadAudit
      ? await tx.query<{
          id: string;
          summary: string;
          action: string;
          actor: string | null;
          created_at: string;
        }>(
          `select a.id, a.summary, a.action, p.full_name as actor, a.created_at
           from audit_logs a left join profiles p on p.id = a.actor_id
           where a.organization_id = $1
           order by a.created_at desc limit 8`,
          [orgId],
        )
      : [];

    const workload = await tx.query<{ name: string; open: number; overdue: number }>(
      `select p.full_name as name,
              count(*) filter (where t.status <> 'done')::int as open,
              count(*) filter (where t.status <> 'done' and t.due_date < current_date)::int as overdue
       from tasks t join profiles p on p.id = t.assignee_id
       where t.organization_id = $1 and t.deleted_at is null
       group by p.full_name
       having count(*) filter (where t.status <> 'done') > 0
       order by open desc limit 6`,
      [orgId],
    );

    let finance = {
      revenueMinor: "0",
      expenseMinor: "0",
      unpaidMinor: "0",
      unpaidCount: 0,
      canRead: options.canReadFinance,
    };
    let monthlyFinance: { month: string; revenue: number; expense: number }[] = [];

    if (options.canReadFinance) {
      const financeRows = await tx.query<{
        revenue: string;
        expense: string;
        unpaid: string;
        unpaid_count: number;
      }>(
        `select
           coalesce((select sum(amount_minor) from revenues
                     where organization_id = $1 and deleted_at is null
                       and ($2::interval is null or received_at >= (current_date - $2::interval))), 0)::text as revenue,
           coalesce((select sum(amount_minor) from expenses
                     where organization_id = $1 and deleted_at is null and status <> 'rejected'
                       and ($2::interval is null or expense_date >= (current_date - $2::interval))), 0)::text as expense,
           coalesce((select sum(total_minor - amount_paid_minor) from invoices
                     where organization_id = $1 and deleted_at is null
                       and status in ('sent', 'partial', 'overdue')), 0)::text as unpaid,
           (select count(*)::int from invoices
            where organization_id = $1 and deleted_at is null and status in ('sent', 'partial', 'overdue')) as unpaid_count`,
        [orgId, interval],
      );
      const row = financeRows[0];
      if (row) {
        finance = {
          revenueMinor: row.revenue,
          expenseMinor: row.expense,
          unpaidMinor: row.unpaid,
          unpaidCount: row.unpaid_count,
          canRead: true,
        };
      }

      const monthly = await tx.query<{ month: string; revenue: string; expense: string }>(
        `with months as (
           select date_trunc('month', current_date) - (n || ' months')::interval as month
           from generate_series(0, 5) as n
         )
         select to_char(m.month, 'YYYY-MM') as month,
           coalesce((select sum(r.amount_minor) from revenues r
                     where r.organization_id = $1 and r.deleted_at is null
                       and date_trunc('month', r.received_at) = m.month), 0)::text as revenue,
           coalesce((select sum(e.amount_minor) from expenses e
                     where e.organization_id = $1 and e.deleted_at is null and e.status <> 'rejected'
                       and date_trunc('month', e.expense_date) = m.month), 0)::text as expense
         from months m order by m.month asc`,
        [orgId],
      );
      monthlyFinance = monthly.map((row2) => ({
        month: row2.month,
        revenue: Number(row2.revenue),
        expense: Number(row2.expense),
      }));
    }

    const upcoming = [
      ...upcomingTasks.map((task) => ({
        id: task.id,
        title: task.title,
        dueDate: task.due_date,
        kind: "task" as const,
        status: task.status,
      })),
      ...upcomingMilestones.map((milestone) => ({
        id: milestone.id,
        title: milestone.title,
        dueDate: milestone.due_date,
        kind: "milestone" as const,
      })),
      ...upcomingEvents.map((event) => ({
        id: event.id,
        title: event.title,
        dueDate: event.starts_at,
        kind: "event" as const,
      })),
    ]
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 8);

    return {
      projects: projects[0] ?? { total: 0, active: 0, completed: 0 },
      tasks: {
        total: tasks[0]?.total ?? 0,
        overdue: tasks[0]?.overdue ?? 0,
        done: tasks[0]?.done ?? 0,
        todo: tasks[0]?.todo ?? 0,
        inProgress: tasks[0]?.in_progress ?? 0,
      },
      customers: {
        total: customers[0]?.total ?? 0,
        newInPeriod: customers[0]?.new_in_period ?? 0,
      },
      leads: { total: leads[0]?.total ?? 0, newInPeriod: leads[0]?.new_in_period ?? 0 },
      opportunities: {
        open: opportunities[0]?.open_count ?? 0,
        amountMinor: opportunities[0]?.amount_minor ?? "0",
        wonInPeriod: opportunities[0]?.won_in_period ?? 0,
      },
      finance,
      recentActivity: activity.map((row) => ({
        id: row.id,
        summary: row.summary,
        action: row.action,
        actor: row.actor,
        createdAt: row.created_at,
      })),
      upcoming,
      tasksByStatus,
      monthlyFinance,
      workload,
    };
  });
}
