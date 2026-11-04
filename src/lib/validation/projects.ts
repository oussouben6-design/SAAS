import { z } from "zod";
import {
  optionalIsoDate,
  optionalText,
  optionalUuid,
  percentSchema,
  requiredText,
  uuidSchema,
} from "./common";

export const PROJECT_STATUSES = ["planning", "active", "on_hold", "completed", "cancelled"] as const;
export const PRIORITIES = ["low", "medium", "high", "critical"] as const;

export const projectSchema = z.object({
  id: optionalUuid,
  name: requiredText("Nom du projet", 2, 160),
  code: optionalText(40),
  description: optionalText(5000),
  objectives: optionalText(5000),
  customerId: optionalUuid,
  departmentId: optionalUuid,
  managerId: optionalUuid,
  status: z.enum(PROJECT_STATUSES).default("planning"),
  priority: z.enum(PRIORITIES).default("medium"),
  startDate: optionalIsoDate,
  endDate: optionalIsoDate,
  budget: z.string().trim().optional(),
  progress: z.preprocess((value) => (value === "" || value === undefined ? 0 : value), percentSchema),
});

export const TASK_STATUSES = ["todo", "in_progress", "review", "done", "blocked"] as const;

export const taskSchema = z.object({
  id: optionalUuid,
  title: requiredText("Titre de la tâche", 2, 200),
  description: optionalText(5000),
  projectId: optionalUuid,
  parentTaskId: optionalUuid,
  assigneeId: optionalUuid,
  status: z.enum(TASK_STATUSES).default("todo"),
  priority: z.enum(PRIORITIES).default("medium"),
  dueDate: optionalIsoDate,
});

export const milestoneSchema = z.object({
  projectId: uuidSchema,
  title: requiredText("Titre du jalon", 2, 160),
  description: optionalText(1000),
  dueDate: optionalIsoDate,
});

export const projectMemberSchema = z.object({
  projectId: uuidSchema,
  userId: uuidSchema,
  role: z.enum(["manager", "member", "observer"]).default("member"),
});

export const documentSchema = z.object({
  name: optionalText(200),
  description: optionalText(1000),
  category: z.enum(["general", "contract", "invoice", "report", "hr", "project", "legal", "other"]).default("general"),
  entityType: z.preprocess(
    (value) => (value === "" || value === undefined ? "" : value),
    z.union([
      z.literal(""),
      z.enum(["customer", "lead", "opportunity", "project", "task", "employee", "invoice", "partner", "organization"]),
    ]),
  ),
  entityId: optionalUuid,
});
