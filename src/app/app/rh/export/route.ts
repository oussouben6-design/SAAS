import { requirePagePermission } from "@/lib/server/context";
import { listEmployees } from "@/modules/hr/service";
import { csvResponse, toCsv } from "@/lib/csv";
import { AppError } from "@/lib/server/errors";
import { CONTRACT_TYPE_LABELS, EMPLOYEE_STATUS_LABELS } from "@/lib/validation/hr";
import { formatDate } from "@/lib/utils";

/** Export CSV des dossiers employés (permission `hr:export`). */
export async function GET() {
  const context = await requirePagePermission("hr", "export");
  if (!context.organization) throw new AppError("unauthorized", "Aucune organisation active.");

  const employees = await listEmployees(
    { userId: context.user.id, organizationId: context.organization.id },
    { page: 1, pageSize: 100 },
  );

  const csv = toCsv(
    [
      "Nom",
      "Prénom",
      "E-mail",
      "Téléphone",
      "Poste",
      "Département",
      "Statut",
      "Contrat",
      "Embauche",
      "Salaire de référence (unité mineure)",
      "Devise",
    ],
    employees.items.map((employee) => [
      employee.last_name,
      employee.first_name,
      employee.email,
      employee.phone,
      employee.job_title,
      employee.department_name,
      EMPLOYEE_STATUS_LABELS[employee.status as keyof typeof EMPLOYEE_STATUS_LABELS] ?? employee.status,
      CONTRACT_TYPE_LABELS[employee.contract_type as keyof typeof CONTRACT_TYPE_LABELS] ?? employee.contract_type,
      formatDate(employee.hire_date),
      employee.base_salary_minor,
      employee.currency,
    ]),
  );

  return csvResponse(`employes-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
