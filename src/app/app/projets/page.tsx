import type { Metadata } from "next";
import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { requirePagePermission, can } from "@/lib/server/context";
import { listProjects, PROJECT_STATUS_LABELS } from "@/modules/projects/service";
import { listDepartments } from "@/modules/organization/service";
import { listCustomers } from "@/modules/crm/service";
import { listAssignableMembers } from "@/modules/tasks/service";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormField, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { FormDialog } from "@/components/forms/form-dialog";
import { FilterBar, Pagination, PriorityBadge, StatusBadge } from "@/components/shared/filters";
import { createProjectAction } from "@/modules/projects/actions";
import { formatDate, formatMoney } from "@/lib/utils";
import { PRIORITIES } from "@/lib/validation/projects";

export const metadata: Metadata = { title: "Projets" };

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const context = await requirePagePermission("projects", "read");
  const params = await searchParams;
  const orgCtx = { userId: context.user.id, organizationId: context.organization!.id };

  const [projects, customers, members, departments] = await Promise.all([
    listProjects(orgCtx, {
      q: params.q,
      status: params.status,
      page: params.page ? Number(params.page) : 1,
    }),
    can(context, "crm", "read") ? listCustomers(orgCtx, { pageSize: 100 }) : Promise.resolve(null),
    listAssignableMembers(orgCtx),
    listDepartments(orgCtx),
  ]);

  const canCreate = can(context, "projects", "create");
  const currency = context.organization!.currency;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Projets"
        description="Portefeuille de projets, budgets prévisionnels et avancement réel."
        actions={
          canCreate ? (
            <FormDialog
              trigger={
                <Button>
                  <Plus /> Nouveau projet
                </Button>
              }
              title="Créer un projet"
              description="Vous pourrez ajouter des jalons, des membres et des tâches ensuite."
              action={createProjectAction}
              submitLabel="Créer le projet"
              className="max-w-2xl"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Nom du projet" htmlFor="project-name" required>
                  <Input id="project-name" name="name" required maxLength={160} />
                </FormField>
                <FormField label="Code interne" htmlFor="project-code">
                  <Input id="project-code" name="code" maxLength={40} />
                </FormField>
                <FormField label="Responsable" htmlFor="project-manager">
                  <NativeSelect id="project-manager" name="managerId" defaultValue={context.user.id}>
                    {members.map((member) => (
                      <option key={member.user_id} value={member.user_id}>
                        {member.full_name}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
                <FormField label="Client" htmlFor="project-customer">
                  <NativeSelect id="project-customer" name="customerId" defaultValue="">
                    <option value="">Aucun client</option>
                    {(customers?.items ?? []).map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
                <FormField label="Département" htmlFor="project-department">
                  <NativeSelect id="project-department" name="departmentId" defaultValue="">
                    <option value="">Aucun département</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
                <FormField label="Statut" htmlFor="project-status">
                  <NativeSelect id="project-status" name="status" defaultValue="planning">
                    {Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
                <FormField label="Priorité" htmlFor="project-priority">
                  <NativeSelect id="project-priority" name="priority" defaultValue="medium">
                    {PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>
                        {priority === "low" ? "Basse" : priority === "medium" ? "Moyenne" : priority === "high" ? "Haute" : "Critique"}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
                <FormField label={`Budget prévisionnel (${currency})`} htmlFor="project-budget">
                  <Input id="project-budget" name="budget" inputMode="decimal" placeholder="0" />
                </FormField>
                <FormField label="Date de début" htmlFor="project-start">
                  <Input id="project-start" name="startDate" type="date" />
                </FormField>
                <FormField label="Date de fin" htmlFor="project-end">
                  <Input id="project-end" name="endDate" type="date" />
                </FormField>
              </div>
              <FormField label="Objectifs" htmlFor="project-objectives">
                <Textarea id="project-objectives" name="objectives" rows={2} />
              </FormField>
              <FormField label="Description" htmlFor="project-description">
                <Textarea id="project-description" name="description" rows={3} />
              </FormField>
            </FormDialog>
          ) : null
        }
      />

      <Card className="overflow-hidden">
        <div className="border-b border-border p-4">
          <FilterBar action="/app/projets" q={params.q} placeholder="Nom ou code du projet…">
            <NativeSelect name="status" defaultValue={params.status ?? ""} className="w-auto min-w-[160px]">
              <option value="">Tous les statuts</option>
              {Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </FilterBar>
        </div>

        {projects.items.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<FolderKanban />}
              title="Aucun projet"
              description="Créez votre premier projet pour suivre les tâches, jalons et budgets."
            />
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Projet</TableHead>
                  <TableHead>Responsable</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Période</TableHead>
                  <TableHead>Budget</TableHead>
                  <TableHead className="min-w-[140px]">Avancement</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.items.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell>
                      <Link href={`/app/projets/${project.id}`} className="font-medium hover:text-primary">
                        {project.name}
                      </Link>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {project.code ? <span>{project.code}</span> : null}
                        <PriorityBadge priority={project.priority} />
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{project.manager_name ?? "—"}</TableCell>
                    <TableCell className="text-xs">{project.customer_name ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(project.start_date)} → {formatDate(project.end_date)}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {formatMoney(project.budget_minor, project.currency)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${project.progress}%` }} />
                        </div>
                        <span className="text-xs tabular-nums text-muted-foreground">{project.progress}%</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {project.tasks_done}/{project.tasks_total} tâches
                      </p>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={project.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination
              page={projects.page}
              totalPages={projects.totalPages}
              total={projects.total}
              basePath="/app/projets"
              params={{ q: params.q, status: params.status }}
            />
          </>
        )}
      </Card>
    </div>
  );
}
