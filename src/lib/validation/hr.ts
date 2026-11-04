import { z } from "zod";
import {
  isoDate,
  optionalEmail,
  optionalIsoDate,
  optionalText,
  optionalUuid,
  requiredText,
  uuidSchema,
} from "./common";
import { moneyInput } from "./finance";

export const EMPLOYEE_STATUSES = ["active", "on_leave", "suspended", "ended"] as const;

export const EMPLOYEE_STATUS_LABELS: Record<(typeof EMPLOYEE_STATUSES)[number], string> = {
  active: "Actif",
  on_leave: "En congé",
  suspended: "Suspendu",
  ended: "Sorti",
};

export const CONTRACT_TYPES = ["cdi", "cdd", "stage", "consultant", "interim", "avenant"] as const;

export const CONTRACT_TYPE_LABELS: Record<(typeof CONTRACT_TYPES)[number], string> = {
  cdi: "CDI",
  cdd: "CDD",
  stage: "Stage",
  consultant: "Consultant",
  interim: "Intérim",
  avenant: "Avenant",
};

export const LEAVE_TYPES = ["annual", "sick", "maternity", "unpaid", "other"] as const;

export const LEAVE_TYPE_LABELS: Record<(typeof LEAVE_TYPES)[number], string> = {
  annual: "Congé annuel",
  sick: "Maladie",
  maternity: "Maternité / paternité",
  unpaid: "Sans solde",
  other: "Autre",
};

export const LEAVE_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;

export const LEAVE_STATUS_LABELS: Record<(typeof LEAVE_STATUSES)[number], string> = {
  pending: "En attente",
  approved: "Approuvé",
  rejected: "Refusé",
  cancelled: "Annulé",
};

export const ATTENDANCE_STATUSES = ["present", "absent", "late", "leave", "remote"] as const;

export const employeeSchema = z.object({
  id: optionalUuid,
  firstName: requiredText("Prénom", 1, 80),
  lastName: requiredText("Nom", 1, 80),
  email: optionalEmail,
  phone: optionalText(40),
  departmentId: optionalUuid,
  jobTitle: optionalText(120),
  managerId: optionalUuid,
  contractType: z.enum(CONTRACT_TYPES).default("cdi"),
  hireDate: optionalIsoDate,
  endDate: optionalIsoDate,
  status: z.enum(EMPLOYEE_STATUSES).default("active"),
  baseSalary: z.preprocess(
    (value) => (value === undefined || value === null ? "" : value),
    z.string().trim().max(24),
  ),
  notes: optionalText(2000),
});

export const employeeStatusSchema = z.object({
  id: uuidSchema,
  status: z.enum(EMPLOYEE_STATUSES),
});

export const contractSchema = z.object({
  employeeId: uuidSchema,
  reference: optionalText(60),
  type: z.enum(CONTRACT_TYPES).default("cdi"),
  startDate: isoDate,
  endDate: optionalIsoDate,
  salary: z.preprocess(
    (value) => (value === undefined || value === null ? "" : value),
    z.string().trim().max(24),
  ),
  signedAt: optionalIsoDate,
  notes: optionalText(1000),
});

export const leaveRequestSchema = z.object({
  employeeId: uuidSchema,
  type: z.enum(LEAVE_TYPES).default("annual"),
  startDate: isoDate,
  endDate: isoDate,
  days: z.coerce.number().positive("Nombre de jours invalide").max(365),
  reason: optionalText(500),
});

export const leaveDecisionSchema = z.object({
  id: uuidSchema,
  decision: z.enum(["approved", "rejected"]),
  comment: optionalText(500),
});

export const attendanceSchema = z.object({
  employeeId: uuidSchema,
  workDate: isoDate,
  status: z.enum(ATTENDANCE_STATUSES).default("present"),
  checkIn: optionalText(5),
  checkOut: optionalText(5),
  notes: optionalText(500),
});

export { moneyInput };
