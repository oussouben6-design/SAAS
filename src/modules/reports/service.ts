import { asMember } from "@/lib/db";
import type { DashboardPeriod } from "@/modules/dashboard/service";
import { periodToInterval } from "@/modules/dashboard/service";

export interface ReportData {
  period: DashboardPeriod;
  projectsByStatus: { status: string; count: number }[];
  tasksByStatus: { status: string; count: number }[];
  tasksByPriority: { priority: string; count: number }[];
  tasksCompletedPerMonth: { month: string; count: number }[];
  customersPerMonth: { month: string; count: number }[];
  leadsBySource: { source: string; count: number }[];
  leadConversion: { total: number; converted: number };
  finance: {
    revenueMinor: string;
    expenseMinor: string;
    netMinor: string;
    byCategory: { name: string; kind: string; amount: string }[];
    invoicesByStatus: { status: string; count: number; total: string }[];
  } | null;
  hr: {
    employees: number;
    byDepartment: { name: string; count: number }[];
    pendingLeaves: number;
  } | null;
  teamPerformance: { name: string; done: number; open: number; overdue: number }[];
}

export async function getReports(
  context: { userId: string; organizationId: string },
  period: DashboardPeriod,
  options: { canReadFinance: boolean; canReadHr: boolean },
): Promise<ReportData> {
  const interval = periodToInterval(period);

  return asMember(context, async (tx) => {
    const orgId = context.organizationId;

    const projectsByStatus = await tx.query<{ status: string; count: number }>(
      `select status, count(*)::int as count from projects
       where organization_id = $1 and deleted_at is null group by status order by count desc`,
      [orgId],
    );

    const tasksByStatus = await tx.query<{ status: string; count: number }>(
      `select status, count(*)::int as count from tasks
       where organization_id = $1 and deleted_at is null group by status`,
      [orgId],
    );

    const tasksByPriority = await tx.query<{ priority: string; count: number }>(
      `select priority, count(*)::int as count from tasks
       where organization_id = $1 and deleted_at is null and status <> 'done' group by priority`,
      [orgId],
    );

    const tasksCompletedPerMonth = await tx.query<{ month: string; count: number }>(
      `with months as (
         select date_trunc('month', current_date) - (n || ' months')::interval as month
         from generate_series(0, 5) as n
       )
       select to_char(m.month, 'YYYY-MM') as month,
         (select count(*)::int from tasks t where t.organization_id = $1 and t.deleted_at is null
            and t.completed_at is not null and date_trunc('month', t.completed_at) = m.month) as count
       from months m order by m.month asc`,
      [orgId],
    );

    const customersPerMonth = await tx.query<{ month: string; count: number }>(
      `with months as (
         select date_trunc('month', current_date) - (n || ' months')::interval as month
         from generate_series(0, 5) as n
       )
       select to_char(m.month, 'YYYY-MM') as month,
         (select count(*)::int from customers c where c.organization_id = $1 and c.deleted_at is null
            and date_trunc('month', c.created_at) = m.month) as count
       from months m order by m.month asc`,
      [orgId],
    );

    const leadsBySource = await tx.query<{ source: string; count: number }>(
      `select source, count(*)::int as count from leads
       where organization_id = $1 and deleted_at is null
         and ($2::interval is null or created_at >= now() - $2::interval)
       group by source order by count desc`,
      [orgId, interval],
    );

    const conversion = await tx.query<{ total: number; converted: number }>(
      `select count(*)::int as total, count(*) filter (where status = 'converted')::int as converted
       from leads where organization_id = $1 and deleted_at is null
         and ($2::interval is null or created_at >= now() - $2::interval)`,
      [orgId, interval],
    );

    const teamPerformance = await tx.query<{ name: string; done: number; open: number; overdue: number }>(
      `select p.full_name as name,
              count(*) filter (where t.status = 'done')::int as done,
              count(*) filter (where t.status <> 'done')::int as open,
              count(*) filter (where t.status <> 'done' and t.due_date < current_date)::int as overdue
       from tasks t join profiles p on p.id = t.assignee_id
       where t.organization_id = $1 and t.deleted_at is null
         and ($2::interval is null or t.created_at >= now() - $2::interval)
       group by p.full_name order by done desc, open desc limit 15`,
      [orgId, interval],
    );

    let finance: ReportData["finance"] = null;
    if (options.canReadFinance) {
      const totals = await tx.query<{ revenue: string; expense: string }>(
        `select
           coalesce((select sum(amount_minor) from revenues where organization_id = $1 and deleted_at is null
             and ($2::interval is null or received_at >= current_date - $2::interval)), 0)::text as revenue,
           coalesce((select sum(amount_minor) from expenses where organization_id = $1 and deleted_at is null
             and status <> 'rejected' and ($2::interval is null or expense_date >= current_date - $2::interval)), 0)::text as expense`,
        [orgId, interval],
      );
      const byCategory = await tx.query<{ name: string; kind: string; amount: string }>(
        `select fc.name, fc.kind, sum(e.amount_minor)::text as amount
         from expenses e join financial_categories fc on fc.id = e.category_id
         where e.organization_id = $1 and e.deleted_at is null and e.status <> 'rejected'
           and ($2::interval is null or e.expense_date >= current_date - $2::interval)
         group by fc.name, fc.kind
         union all
         select fc.name, fc.kind, sum(r.amount_minor)::text as amount
         from revenues r join financial_categories fc on fc.id = r.category_id
         where r.organization_id = $1 and r.deleted_at is null
           and ($2::interval is null or r.received_at >= current_date - $2::interval)
         group by fc.name, fc.kind`,
        [orgId, interval],
      );
      const invoicesByStatus = await tx.query<{ status: string; count: number; total: string }>(
        `select status, count(*)::int as count, coalesce(sum(total_minor), 0)::text as total
         from invoices where organization_id = $1 and deleted_at is null group by status`,
        [orgId],
      );
      const revenue = totals[0]?.revenue ?? "0";
      const expense = totals[0]?.expense ?? "0";
      finance = {
        revenueMinor: revenue,
        expenseMinor: expense,
        netMinor: String(Number(revenue) - Number(expense)),
        byCategory,
        invoicesByStatus,
      };
    }

    let hr: ReportData["hr"] = null;
    if (options.canReadHr) {
      const employees = await tx.query<{ count: number }>(
        "select count(*)::int as count from employees where organization_id = $1 and deleted_at is null and status <> 'ended'",
        [orgId],
      );
      const byDepartment = await tx.query<{ name: string; count: number }>(
        `select coalesce(d.name, 'Sans département') as name, count(*)::int as count
         from employees e left join departments d on d.id = e.department_id
         where e.organization_id = $1 and e.deleted_at is null and e.status <> 'ended'
         group by d.name order by count desc`,
        [orgId],
      );
      const leaves = await tx.query<{ count: number }>(
        "select count(*)::int as count from leave_requests where organization_id = $1 and status = 'pending'",
        [orgId],
      );
      hr = {
        employees: employees[0]?.count ?? 0,
        byDepartment,
        pendingLeaves: leaves[0]?.count ?? 0,
      };
    }

    return {
      period,
      projectsByStatus,
      tasksByStatus,
      tasksByPriority,
      tasksCompletedPerMonth,
      customersPerMonth,
      leadsBySource,
      leadConversion: conversion[0] ?? { total: 0, converted: 0 },
      finance,
      hr,
      teamPerformance,
    };
  });
}
