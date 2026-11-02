import { asMember, type SqlExecutor } from "@/lib/db";
import { AppError } from "@/lib/server/errors";
import { EMPLOYEE_STATUSES } from "@/lib/validation/hr";
import { recordAudit } from "@/lib/server/audit";

/**
 * Module Ressources humaines.
 *
 * Périmètre réel : dossiers employés, contrats, demandes de congés avec validation,
 * et pointage simple. Aucun calcul de paie, aucune déclaration sociale : le salaire de base
 * est une information de référence, pas un bulletin de paie.
 */

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function paginate<T>(items: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

async function organizationCurrency(tx: SqlExecutor, organizationId: string): Promise<string> {
  const rows = await tx.query<{ currency: string }>(
    "select currency from organizations where id = $1",
    [organizationId],
  );
  return rows[0]?.currency ?? "XOF";
}

export interface EmployeeListItem {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  status: string;
  contract_type: string;
  hire_date: string | null;
  department_name: string | null;
  manager_name: string | null;
  base_salary_minor: string | null;
  currency: string;
}

export interface EmployeeFilters {
  q?: string;
  status?: string;
  departmentId?: string;
  page?: number;
  pageSize?: number;
}

export async function listEmployees(
  context: { userId: string; organizationId: string },
  filters: EmployeeFilters = {},
): Promise<Paginated<EmployeeListItem>> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 20));

  return asMember(context, async (tx) => {
    const values: unknown[] = [context.organizationId];
    const conditions = ["e.organization_id = $1", "e.deleted_at is null"];
    if (filters.status && filters.status !== "all") {
      values.push(filters.status);
      conditions.push(`e.status = $${values.length}`);
    }
    if (filters.departmentId) {
      values.push(filters.departmentId);
      conditions.push(`e.department_id = $${values.length}`);
    }
    if (filters.q?.trim()) {
      values.push(`%${filters.q.trim()}%`);
      conditions.push(
        `(e.first_name ilike $${values.length} or e.last_name ilike $${values.length}
          or coalesce(e.email, '') ilike $${values.length} or coalesce(e.job_title, '') ilike $${values.length})`,
      );
    }
    const where = conditions.join(" and ");

    const count = await tx.query<{ count: number }>(
      `select count(*)::int as count from employees e where ${where}`,
      values,
    );
    const rows = await tx.query<EmployeeListItem>(
      `select e.id, e.first_name, e.last_name, e.email, e.phone, e.job_title, e.status,
              e.contract_type, e.hire_date, d.name as department_name,
              m.first_name || ' ' || m.last_name as manager_name,
              e.base_salary_minor::text, e.currency
       from employees e
       left join departments d on d.id = e.department_id
       left join employees m on m.id = e.manager_id
       where ${where}
       order by e.last_name asc, e.first_name asc
       limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, pageSize, (page - 1) * pageSize],
    );
    return paginate(rows, count[0]?.count ?? 0, page, pageSize);
  });
}

export interface HrSummary {
  currency: string;
  headcount: number;
  active: number;
  onLeave: number;
  pendingLeave: number;
  payrollMinor: string;
}

export async function getHrSummary(context: {
  userId: string;
  organizationId: string;
}): Promise<HrSummary> {
  return asMember(context, async (tx) => {
    const currency = await organizationCurrency(tx, context.organizationId);
    const rows = await tx.query<{
      headcount: number;
      active: number;
      on_leave: number;
      pending_leave: number;
      payroll: string;
    }>(
      `select
         (select count(*)::int from employees where organization_id = $1 and deleted_at is null and status <> 'ended') as headcount,
         (select count(*)::int from employees where organization_id = $1 and deleted_at is null and status = 'active') as active,
         (select count(*)::int from employees where organization_id = $1 and deleted_at is null and status = 'on_leave') as on_leave,
         (select count(*)::int from leave_requests where organization_id = $1 and status = 'pending') as pending_leave,
         coalesce((select sum(base_salary_minor) from employees
                   where organization_id = $1 and deleted_at is null and status = 'active'), 0)::text as payroll`,
      [context.organizationId],
    );
    const row = rows[0]!;
    return {
      currency,
      headcount: row.headcount,
      active: row.active,
      onLeave: row.on_leave,
      pendingLeave: row.pending_leave,
      payrollMinor: row.payroll,
    };
  });
}

export interface EmployeeDetail {
  employee: EmployeeListItem & {
    end_date: string | null;
    notes: string | null;
    department_id: string | null;
    manager_id: string | null;
    user_id: string | null;
  };
  contracts: {
    id: string;
    reference: string | null;
    type: string;
    start_date: string;
    end_date: string | null;
    salary_minor: string | null;
    currency: string;
    signed_at: string | null;
  }[];
  leaves: {
    id: string;
    type: string;
    start_date: string;
    end_date: string;
    days: string;
    status: string;
    reason: string | null;
    decision_comment: string | null;
    decided_at: string | null;
  }[];
  attendance: {
    id: string;
    work_date: string;
    status: string;
    check_in: string | null;
    check_out: string | null;
  }[];
}

export async function getEmployee(
  context: { userId: string; organizationId: string },
  employeeId: string,
): Promise<EmployeeDetail> {
  return asMember(context, async (tx) => {
    const rows = await tx.query<EmployeeDetail["employee"]>(
      `select e.id, e.first_name, e.last_name, e.email, e.phone, e.job_title, e.status,
              e.contract_type, e.hire_date, e.end_date, e.notes, e.department_id, e.manager_id,
              e.user_id, d.name as department_name,
              m.first_name || ' ' || m.last_name as manager_name,
              e.base_salary_minor::text, e.currency
       from employees e
       left join departments d on d.id = e.department_id
       left join employees m on m.id = e.manager_id
       where e.id = $1 and e.organization_id = $2 and e.deleted_at is null`,
      [employeeId, context.organizationId],
    );
    const employee = rows[0];
    if (!employee) throw new AppError("not_found", "Employé introuvable.");

    const [contracts, leaves, attendance] = await Promise.all([
      tx.query<EmployeeDetail["contracts"][number]>(
        `select id, reference, type, start_date, end_date, salary_minor::text, currency, signed_at
         from employee_contracts where employee_id = $1 order by start_date desc`,
        [employeeId],
      ),
      tx.query<EmployeeDetail["leaves"][number]>(
        `select id, type, start_date, end_date, days::text, status, reason, decision_comment, decided_at
         from leave_requests where employee_id = $1 order by start_date desc`,
        [employeeId],
      ),
      tx.query<EmployeeDetail["attendance"][number]>(
        `select id, work_date, status, check_in::text, check_out::text
         from attendance_records where employee_id = $1 order by work_date desc limit 30`,
        [employeeId],
      ),
    ]);

    return { employee, contracts, leaves, attendance };
  });
}

export interface EmployeeInput {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  departmentId: string | null;
  jobTitle: string | null;
  managerId: string | null;
  contractType: string;
  hireDate: string | null;
  endDate: string | null;
  status: string;
  baseSalaryMinor: number | null;
  notes: string | null;
}

export async function createEmployee(
  context: { userId: string; organizationId: string },
  input: EmployeeInput,
): Promise<string> {
  if (input.endDate && input.hireDate && input.endDate < input.hireDate) {
    throw new AppError("validation", "La date de fin ne peut pas précéder la date d'embauche.");
  }
  return asMember(context, async (tx) => {
    const currency = await organizationCurrency(tx, context.organizationId);
    const rows = await tx.query<{ id: string }>(
      `insert into employees
        (organization_id, first_name, last_name, email, phone, department_id, job_title, manager_id,
         contract_type, hire_date, end_date, status, base_salary_minor, currency, notes, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       returning id`,
      [
        context.organizationId,
        input.firstName,
        input.lastName,
        input.email,
        input.phone,
        input.departmentId,
        input.jobTitle,
        input.managerId,
        input.contractType,
        input.hireDate,
        input.endDate,
        input.status,
        input.baseSalaryMinor,
        currency,
        input.notes,
        context.userId,
      ],
    );
    const employeeId = rows[0]!.id;
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "employee.create",
      entityType: "employee",
      entityId: employeeId,
      summary: `Création du dossier employé ${input.firstName} ${input.lastName}`,
    });
    return employeeId;
  });
}

export async function updateEmployee(
  context: { userId: string; organizationId: string },
  input: EmployeeInput & { id: string },
): Promise<void> {
  if (input.endDate && input.hireDate && input.endDate < input.hireDate) {
    throw new AppError("validation", "La date de fin ne peut pas précéder la date d'embauche.");
  }
  await asMember(context, async (tx) => {
    const rows = await tx.query<{ id: string }>(
      "select id from employees where id = $1 and organization_id = $2 and deleted_at is null",
      [input.id, context.organizationId],
    );
    if (!rows[0]) throw new AppError("not_found", "Employé introuvable.");

    await tx.query(
      `update employees set first_name = $2, last_name = $3, email = $4, phone = $5,
         department_id = $6, job_title = $7, manager_id = $8, contract_type = $9, hire_date = $10,
         end_date = $11, status = $12, base_salary_minor = $13, notes = $14
       where id = $1 and organization_id = $15`,
      [
        input.id,
        input.firstName,
        input.lastName,
        input.email,
        input.phone,
        input.departmentId,
        input.jobTitle,
        input.managerId,
        input.contractType,
        input.hireDate,
        input.endDate,
        input.status,
        input.baseSalaryMinor,
        input.notes,
        context.organizationId,
      ],
    );
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "employee.update",
      entityType: "employee",
      entityId: input.id,
      summary: `Mise à jour du dossier employé ${input.firstName} ${input.lastName}`,
    });
  });
}

export async function setEmployeeStatus(
  context: { userId: string; organizationId: string },
  input: { id: string; status: string },
): Promise<void> {
  if (!(EMPLOYEE_STATUSES as readonly string[]).includes(input.status)) {
    throw new AppError("validation", "Statut employé invalide.");
  }
  await asMember(context, async (tx) => {
    const rows = await tx.query<{ first_name: string; last_name: string }>(
      "select first_name, last_name from employees where id = $1 and organization_id = $2 and deleted_at is null",
      [input.id, context.organizationId],
    );
    const employee = rows[0];
    if (!employee) throw new AppError("not_found", "Employé introuvable.");
    await tx.query("update employees set status = $2 where id = $1 and organization_id = $3", [
      input.id,
      input.status,
      context.organizationId,
    ]);
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "employee.status",
      entityType: "employee",
      entityId: input.id,
      summary: `Statut de ${employee.first_name} ${employee.last_name} : ${input.status}`,
    });
  });
}

export async function deleteEmployee(
  context: { userId: string; organizationId: string },
  employeeId: string,
): Promise<void> {
  await asMember(context, async (tx) => {
    const rows = await tx.query<{ first_name: string; last_name: string }>(
      "select first_name, last_name from employees where id = $1 and organization_id = $2 and deleted_at is null",
      [employeeId, context.organizationId],
    );
    const employee = rows[0];
    if (!employee) throw new AppError("not_found", "Employé introuvable.");
    await tx.query("update employees set deleted_at = now() where id = $1 and organization_id = $2", [
      employeeId,
      context.organizationId,
    ]);
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "employee.delete",
      entityType: "employee",
      entityId: employeeId,
      summary: `Archivage du dossier employé ${employee.first_name} ${employee.last_name}`,
    });
  });
}

export async function addContract(
  context: { userId: string; organizationId: string },
  input: {
    employeeId: string;
    reference: string | null;
    type: string;
    startDate: string;
    endDate: string | null;
    salaryMinor: number | null;
    signedAt: string | null;
    notes: string | null;
  },
): Promise<void> {
  if (input.endDate && input.endDate < input.startDate) {
    throw new AppError("validation", "La date de fin du contrat précède sa date de début.");
  }
  await asMember(context, async (tx) => {
    const employee = await tx.query<{ first_name: string; last_name: string }>(
      "select first_name, last_name from employees where id = $1 and organization_id = $2 and deleted_at is null",
      [input.employeeId, context.organizationId],
    );
    if (!employee[0]) throw new AppError("not_found", "Employé introuvable.");
    const currency = await organizationCurrency(tx, context.organizationId);
    const rows = await tx.query<{ id: string }>(
      `insert into employee_contracts
        (organization_id, employee_id, reference, type, start_date, end_date, salary_minor, currency,
         signed_at, notes)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
      [
        context.organizationId,
        input.employeeId,
        input.reference,
        input.type,
        input.startDate,
        input.endDate,
        input.salaryMinor,
        currency,
        input.signedAt,
        input.notes,
      ],
    );
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "contract.create",
      entityType: "employee_contract",
      entityId: rows[0]!.id,
      summary: `Contrat ${input.type} ajouté pour ${employee[0]!.first_name} ${employee[0]!.last_name}`,
    });
  });
}

export interface LeaveRow {
  id: string;
  employee_id: string;
  employee_name: string;
  type: string;
  start_date: string;
  end_date: string;
  days: string;
  status: string;
  reason: string | null;
  decision_comment: string | null;
  decided_at: string | null;
  decided_by_name: string | null;
}

export async function listLeaveRequests(
  context: { userId: string; organizationId: string },
  filters: { status?: string; page?: number; pageSize?: number } = {},
): Promise<Paginated<LeaveRow>> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 20));

  return asMember(context, async (tx) => {
    const values: unknown[] = [context.organizationId];
    const conditions = ["l.organization_id = $1"];
    if (filters.status && filters.status !== "all") {
      values.push(filters.status);
      conditions.push(`l.status = $${values.length}`);
    }
    const where = conditions.join(" and ");
    const count = await tx.query<{ count: number }>(
      `select count(*)::int as count from leave_requests l where ${where}`,
      values,
    );
    const rows = await tx.query<LeaveRow>(
      `select l.id, l.employee_id, e.first_name || ' ' || e.last_name as employee_name, l.type,
              l.start_date, l.end_date, l.days::text, l.status, l.reason, l.decision_comment,
              l.decided_at, p.full_name as decided_by_name
       from leave_requests l
       join employees e on e.id = l.employee_id
       left join profiles p on p.id = l.decided_by
       where ${where}
       order by l.created_at desc
       limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, pageSize, (page - 1) * pageSize],
    );
    return paginate(rows, count[0]?.count ?? 0, page, pageSize);
  });
}

export async function createLeaveRequest(
  context: { userId: string; organizationId: string },
  input: {
    employeeId: string;
    type: string;
    startDate: string;
    endDate: string;
    days: number;
    reason: string | null;
  },
): Promise<void> {
  if (input.endDate < input.startDate) {
    throw new AppError("validation", "La date de fin doit être postérieure à la date de début.");
  }
  await asMember(context, async (tx) => {
    const employee = await tx.query<{ first_name: string; last_name: string }>(
      "select first_name, last_name from employees where id = $1 and organization_id = $2 and deleted_at is null",
      [input.employeeId, context.organizationId],
    );
    if (!employee[0]) throw new AppError("not_found", "Employé introuvable.");

    const overlap = await tx.query<{ id: string }>(
      `select id from leave_requests
       where employee_id = $1 and status in ('pending', 'approved')
         and start_date <= $3 and end_date >= $2`,
      [input.employeeId, input.startDate, input.endDate],
    );
    if (overlap.length > 0) {
      throw new AppError("conflict", "Une demande de congé couvre déjà cette période.");
    }

    const rows = await tx.query<{ id: string }>(
      `insert into leave_requests (organization_id, employee_id, type, start_date, end_date, days, reason, status)
       values ($1, $2, $3, $4, $5, $6, $7, 'pending') returning id`,
      [
        context.organizationId,
        input.employeeId,
        input.type,
        input.startDate,
        input.endDate,
        input.days,
        input.reason,
      ],
    );
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "leave.create",
      entityType: "leave_request",
      entityId: rows[0]!.id,
      summary: `Demande de congé pour ${employee[0]!.first_name} ${employee[0]!.last_name} (${input.days} j)`,
    });
  });
}

export async function decideLeaveRequest(
  context: { userId: string; organizationId: string },
  input: { id: string; decision: "approved" | "rejected"; comment: string | null },
): Promise<void> {
  await asMember(context, async (tx) => {
    const rows = await tx.query<{ status: string; employee_id: string; days: string }>(
      "select status, employee_id, days::text from leave_requests where id = $1 and organization_id = $2",
      [input.id, context.organizationId],
    );
    const request = rows[0];
    if (!request) throw new AppError("not_found", "Demande de congé introuvable.");
    if (request.status !== "pending") {
      throw new AppError("conflict", "Cette demande a déjà été traitée.");
    }
    await tx.query(
      `update leave_requests set status = $2, decided_by = $3, decided_at = now(), decision_comment = $4
       where id = $1 and organization_id = $5`,
      [input.id, input.decision, context.userId, input.comment, context.organizationId],
    );
    if (input.decision === "approved") {
      // Seul l'employé concerné passe « en congé » s'il n'a pas déjà été marqué ainsi.
      await tx.query(
        "update employees set status = 'on_leave' where id = $1 and organization_id = $2 and status = 'active'",
        [request.employee_id, context.organizationId],
      );
    } else {
      await tx.query(
        "update employees set status = 'active' where id = $1 and organization_id = $2 and status = 'on_leave'",
        [request.employee_id, context.organizationId],
      );
    }
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: input.decision === "approved" ? "leave.approve" : "leave.reject",
      entityType: "leave_request",
      entityId: input.id,
      summary: `Demande de congé ${input.decision === "approved" ? "approuvée" : "refusée"} (${request.days} j)`,
      metadata: { comment: input.comment },
    });
  });
}

export async function recordAttendance(
  context: { userId: string; organizationId: string },
  input: {
    employeeId: string;
    workDate: string;
    status: string;
    checkIn: string | null;
    checkOut: string | null;
    notes: string | null;
  },
): Promise<void> {
  await asMember(context, async (tx) => {
    const employee = await tx.query<{ first_name: string; last_name: string }>(
      "select first_name, last_name from employees where id = $1 and organization_id = $2 and deleted_at is null",
      [input.employeeId, context.organizationId],
    );
    if (!employee[0]) throw new AppError("not_found", "Employé introuvable.");

    await tx.query(
      `insert into attendance_records (organization_id, employee_id, work_date, check_in, check_out, status, notes)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (employee_id, work_date) do update
         set check_in = excluded.check_in, check_out = excluded.check_out,
             status = excluded.status, notes = excluded.notes`,
      [context.organizationId, input.employeeId, input.workDate, input.checkIn, input.checkOut, input.status, input.notes],
    );
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "attendance.record",
      entityType: "employee",
      entityId: input.employeeId,
      summary: `Pointage ${input.workDate} : ${input.status} pour ${employee[0]!.first_name} ${employee[0]!.last_name}`,
    });
  });
}

/** Liste simplifiée des employés pour les sélecteurs (congés, pointage). */
export async function listEmployeeOptions(context: {
  userId: string;
  organizationId: string;
}): Promise<{ id: string; name: string; status: string }[]> {
  return asMember(context, async (tx) => {
    const rows = await tx.query<{ id: string; first_name: string; last_name: string; status: string }>(
      `select id, first_name, last_name, status from employees
       where organization_id = $1 and deleted_at is null and status <> 'ended'
       order by last_name, first_name`,
      [context.organizationId],
    );
    return rows.map((row) => ({ id: row.id, name: `${row.first_name} ${row.last_name}`, status: row.status }));
  });
}
