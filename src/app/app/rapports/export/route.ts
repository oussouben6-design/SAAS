import { requirePagePermission } from "@/lib/server/context";
import { csvResponse, toCsv } from "@/lib/csv";
import { AppError } from "@/lib/server/errors";
import { listTasks } from "@/modules/tasks/service";
import { listProjects } from "@/modules/projects/service";
import { getReports } from "@/modules/reports/service";
import type { DashboardPeriod } from "@/modules/dashboard/service";
import { can } from "@/lib/server/context";

const PERIODS = ["7d", "30d", "90d", "12m", "all"];

export async function GET(request: Request) {
  const context = await requirePagePermission("reports", "export");
  if (!context.organization) throw new AppError("unauthorized", "Aucune organisation active.");
  const orgCtx = { userId: context.user.id, organizationId: context.organization.id };

  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "tasks";
  const periodParam = url.searchParams.get("period") ?? "90d";
  const period = (PERIODS.includes(periodParam) ? periodParam : "90d") as DashboardPeriod;
  const stamp = new Date().toISOString().slice(0, 10);

  if (type === "tasks") {
    const tasks = await listTasks(orgCtx, {});
    const csv = toCsv(
      ["Titre", "Statut", "Priorité", "Projet", "Assignée à", "Échéance", "Créée le", "Commentaires"],
      tasks.map((task) => [
        task.title,
        task.status,
        task.priority,
        task.project_name,
        task.assignee_name,
        task.due_date,
        task.created_at,
        task.comments_count,
      ]),
    );
    return csvResponse(`excellence360-taches-${stamp}.csv`, csv);
  }

  if (type === "projects") {
    const projects = await listProjects(orgCtx, { pageSize: 50 });
    const csv = toCsv(
      ["Projet", "Code", "Statut", "Priorité", "Responsable", "Client", "Début", "Fin", "Budget", "Avancement"],
      projects.items.map((project) => [
        project.name,
        project.code,
        project.status,
        project.priority,
        project.manager_name,
        project.customer_name,
        project.start_date,
        project.end_date,
        project.budget_minor,
        project.progress,
      ]),
    );
    return csvResponse(`excellence360-projets-${stamp}.csv`, csv);
  }

  if (type === "finance") {
    if (!can(context, "finance", "read")) {
      throw new AppError("forbidden", "Votre rôle n'a pas accès aux données financières.");
    }
    const reports = await getReports(orgCtx, period, { canReadFinance: true, canReadHr: false });
    if (!reports.finance) throw new AppError("unavailable", "Données financières indisponibles.");
    const csv = toCsv(
      ["Catégorie", "Type", "Montant (unité mineure)"],
      reports.finance.byCategory.map((row) => [row.name, row.kind, row.amount]),
    );
    return csvResponse(`excellence360-finances-${stamp}.csv`, csv);
  }

  throw new AppError("validation", "Type d'export inconnu.");
}
