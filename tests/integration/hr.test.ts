import { describe, expect, it } from "vitest";
import { createTestActor, contextOf } from "../helpers";
import {
  addContract,
  createEmployee,
  createLeaveRequest,
  decideLeaveRequest,
  deleteEmployee,
  getEmployee,
  getHrSummary,
  listEmployees,
  listLeaveRequests,
  recordAttendance,
  setEmployeeStatus,
  updateEmployee,
} from "@/modules/hr/service";
import { privileged } from "@/lib/db";

const baseEmployee = {
  firstName: "Amina",
  lastName: "Diallo",
  email: "amina.diallo@organix.test",
  phone: "+22790000000",
  departmentId: null,
  jobTitle: "Chargée de projet",
  managerId: null,
  contractType: "cdi",
  hireDate: "2026-01-05",
  endDate: null,
  status: "active",
  baseSalaryMinor: 45_000_000,
  notes: null,
};

describe("RH : dossiers employés", () => {
  it("crée un employé, le retrouve, le modifie et le soft-delete", async () => {
    const actor = await createTestActor({ name: "Responsable RH" });
    const ctx = contextOf(actor);

    const employeeId = await createEmployee(ctx, baseEmployee);
    let detail = await getEmployee(ctx, employeeId);
    expect(detail.employee.first_name).toBe("Amina");
    expect(detail.employee.base_salary_minor).toBe("45000000");
    expect(detail.contracts).toHaveLength(0);

    await updateEmployee(ctx, {
      id: employeeId,
      ...baseEmployee,
      jobTitle: "Cheffe de projet",
      status: "active",
    });
    detail = await getEmployee(ctx, employeeId);
    expect(detail.employee.job_title).toBe("Cheffe de projet");

    const summary = await getHrSummary(ctx);
    expect(summary.active).toBe(1);
    expect(summary.headcount).toBe(1);

    await deleteEmployee(ctx, employeeId);
    const list = await listEmployees(ctx, { pageSize: 10 });
    expect(list.items).toHaveLength(0);
    await expect(getEmployee(ctx, employeeId)).rejects.toThrow(/introuvable/i);
  });

  it("refuse une date de fin antérieure à l'embauche et enregistre les contrats", async () => {
    const actor = await createTestActor({ name: "RH 2" });
    const ctx = contextOf(actor);

    await expect(
      createEmployee(ctx, { ...baseEmployee, endDate: "2025-12-31" }),
    ).rejects.toThrow(/date de fin/i);

    const employeeId = await createEmployee(ctx, baseEmployee);
    await addContract(ctx, {
      employeeId,
      reference: "CDI-2026-001",
      type: "cdi",
      startDate: "2026-01-05",
      endDate: null,
      salaryMinor: 45_000_000,
      signedAt: "2026-01-04",
      notes: null,
    });
    const detail = await getEmployee(ctx, employeeId);
    expect(detail.contracts).toHaveLength(1);
    expect(detail.contracts[0]?.reference).toBe("CDI-2026-001");
  });
});

describe("RH : congés et pointage", () => {
  it("approuve un congé, bascule le statut employé et refuse les chevauchements", async () => {
    const actor = await createTestActor({ name: "RH Congés" });
    const ctx = contextOf(actor);
    const employeeId = await createEmployee(ctx, baseEmployee);

    await createLeaveRequest(ctx, {
      employeeId,
      type: "annual",
      startDate: "2026-08-10",
      endDate: "2026-08-20",
      days: 9,
      reason: "Congés annuels",
    });
    const stored = await privileged((tx) =>
      tx.query<{ id: string }>(
        "select id from leave_requests where employee_id = $1 and status = 'pending'",
        [employeeId],
      ),
    );
    const leaveId = stored[0]!.id;

    await expect(
      createLeaveRequest(ctx, {
        employeeId,
        type: "sick",
        startDate: "2026-08-15",
        endDate: "2026-08-18",
        days: 4,
        reason: "Chevauchement",
      }),
    ).rejects.toThrow(/couvre déjà cette période/i);

    await decideLeaveRequest(ctx, {
      id: leaveId,
      decision: "approved",
      comment: "Validé",
    });
    let detail = await getEmployee(ctx, employeeId);
    expect(detail.employee.status).toBe("on_leave");
    const leaves = await listLeaveRequests(ctx, { status: "approved", pageSize: 10 });
    expect(leaves.items).toHaveLength(1);
    expect(leaves.items[0]?.employee_name).toContain("Amina");

    // Une demande déjà traitée ne peut plus l'être une seconde fois.
    await expect(
      decideLeaveRequest(ctx, { id: leaveId, decision: "rejected", comment: "Annulé" }),
    ).rejects.toThrow(/déjà été traitée/i);

    // Une nouvelle demande refusée remet l'employé en statut actif.
    await createLeaveRequest(ctx, {
      employeeId,
      type: "unpaid",
      startDate: "2026-09-10",
      endDate: "2026-09-12",
      days: 3,
      reason: null,
    });
    const second = await privileged((tx) =>
      tx.query<{ id: string }>(
        "select id from leave_requests where employee_id = $1 and status = 'pending'",
        [employeeId],
      ),
    );
    await decideLeaveRequest(ctx, {
      id: second[0]!.id,
      decision: "rejected",
      comment: "Période chargée",
    });
    detail = await getEmployee(ctx, employeeId);
    expect(detail.employee.status).toBe("active");
  });

  it("enregistre un pointage unique par jour et par employé", async () => {
    const actor = await createTestActor({ name: "RH Pointage" });
    const ctx = contextOf(actor);
    const employeeId = await createEmployee(ctx, baseEmployee);

    await recordAttendance(ctx, {
      employeeId,
      workDate: "2026-09-01",
      status: "present",
      checkIn: "08:00",
      checkOut: "17:00",
      notes: null,
    });
    await recordAttendance(ctx, {
      employeeId,
      workDate: "2026-09-01",
      status: "remote",
      checkIn: "09:00",
      checkOut: "16:00",
      notes: "Télétravail",
    });

    const rows = await privileged((tx) =>
      tx.query<{ status: string; count: number }>(
        `select status, (select count(*)::int from attendance_records ar
                         where ar.employee_id = $1 and ar.work_date = '2026-09-01') as count
         from attendance_records where employee_id = $1 and work_date = '2026-09-01'`,
        [employeeId],
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.count).toBe(1);
    expect(rows[0]?.status).toBe("remote");

    const detail = await getEmployee(ctx, employeeId);
    expect(detail.attendance).toHaveLength(1);
  });

  it("valide la cohérence du statut employé", async () => {
    const actor = await createTestActor({ name: "RH Statut" });
    const ctx = contextOf(actor);
    const employeeId = await createEmployee(ctx, baseEmployee);
    await setEmployeeStatus(ctx, { id: employeeId, status: "suspended" });
    const detail = await getEmployee(ctx, employeeId);
    expect(detail.employee.status).toBe("suspended");
    await expect(
      setEmployeeStatus(ctx, { id: employeeId, status: "inconnu" }),
    ).rejects.toThrow(/statut/i);
  });
});
