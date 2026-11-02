import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Circle, FileText, Pencil, Plus, Target, Trash2, UserPlus } from "lucide-react";
import { requirePagePermission, can } from "@/lib/server/context";
import { getProject, PROJECT_STATUS_LABELS } from "@/modules/projects/service";
import { listDepartments } from "@/modules/organization/service";
import { listCustomers } from "@/modules/crm/service";
import { listAssignableMembers } from "@/modules/tasks/service";
import { AppError } from "@/lib/server/errors";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormDialog } from "@/components/forms/form-dialog";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { QuickActionButton } from "@/components/forms/quick-action";
import { PriorityBadge, StatusBadge } from "@/components/shared/filters";
import {
  addMilestoneAction,
  addProjectMemberAction,
  deleteMilestoneAction,
  deleteProjectAction,
  removeProjectMemberAction,
  toggleMilestoneAction,
  updateProjectAction,
} from "@/modules/projects/actions";
import { formatDate, formatMoney } from "@/lib/utils";
import { PRIORITIES } from "@/lib/validation/projects";

export const metadata: Metadata = { title: "Projet" };

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requirePagePermission("projects", "read");
  const { id } = await params;
  const orgCtx = { userId: context.user.id, organizationId: context.organization!.id };

  let data;
  try {
    data = await getProject(orgCtx, id);
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") notFound();
    throw error;
  }
  const { project, milestones, members, tasks, documents } = data;

  const [customers, teamMembers, departments] = await Promise.all([
    can(context, "crm", "read") ? listCustomers(orgCtx, { pageSize: 100 }) : Promise.resolve(null),
    listAssignableMembers(orgCtx),
    listDepartments(orgCtx),
  ]);

  const canUpdate = can(context, "projects", "update");
  const canDelete = can(context, "projects", "delete");

  return (
    <div className="space-y-5">
      <Link href="/app/projets" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Projets
      </Link>

      <PageHeader
        title={project.name}
        description={project.description ?? "Aucune description fournie."}
        badge={<StatusBadge status={project.status} />}
        actions={
          <>
            {canUpdate ? (
              <FormDialog
                trigger={
                  <Button variant="outline">
                    <Pencil /> Modifier
                  </Button>
                }
                title="Modifier le projet"
                action={updateProjectAction}
                submitLabel="Enregistrer"
                className="max-w-2xl"
              >
                <input type="hidden" name="id" value={project.id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Nom" htmlFor="edit-project-name" required>
                    <Input id="edit-project-name" name="name" defaultValue={project.name} required />
                  </FormField>
                  <FormField label="Code" htmlFor="edit-project-code">
                    <Input id="edit-project-code" name="code" defaultValue={project.code ?? ""} />
                  </FormField>
                  <FormField label="Responsable" htmlFor="edit-project-manager">
                    <NativeSelect id="edit-project-manager" name="managerId" defaultValue={project.manager_id ?? ""}>
                      <option value="">Non assigné</option>
                      {teamMembers.map((member) => (
                        <option key={member.user_id} value={member.user_id}>
                          {member.full_name}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Client" htmlFor="edit-project-customer">
                    <NativeSelect id="edit-project-customer" name="customerId" defaultValue={project.customer_id ?? ""}>
                      <option value="">Aucun</option>
                      {(customers?.items ?? []).map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Département" htmlFor="edit-project-department">
                    <NativeSelect id="edit-project-department" name="departmentId" defaultValue={project.department_id ?? ""}>
                      <option value="">Aucun</option>
                      {departments.map((department) => (
                        <option key={department.id} value={department.id}>
                          {department.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Statut" htmlFor="edit-project-status">
                    <NativeSelect id="edit-project-status" name="status" defaultValue={project.status}>
                      {Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Priorité" htmlFor="edit-project-priority">
                    <NativeSelect id="edit-project-priority" name="priority" defaultValue={project.priority}>
                      {PRIORITIES.map((priority) => (
                        <option key={priority} value={priority}>
                          {priority}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Avancement (%)" htmlFor="edit-project-progress">
                    <Input id="edit-project-progress" name="progress" type="number" min={0} max={100} defaultValue={project.progress} />
                  </FormField>
                  <FormField label="Budget" htmlFor="edit-project-budget">
                    <Input
                      id="edit-project-budget"
                      name="budget"
                      inputMode="decimal"
                      defaultValue={
                        Number(project.budget_minor) / 10 ** (project.currency === "XOF" || project.currency === "XAF" ? 0 : 2)
                      }
                    />
                  </FormField>
                  <FormField label="Début" htmlFor="edit-project-start">
                    <Input id="edit-project-start" name="startDate" type="date" defaultValue={project.start_date ?? ""} />
                  </FormField>
                  <FormField label="Fin" htmlFor="edit-project-end">
                    <Input id="edit-project-end" name="endDate" type="date" defaultValue={project.end_date ?? ""} />
                  </FormField>
                </div>
                <FormField label="Objectifs" htmlFor="edit-project-objectives">
                  <Textarea id="edit-project-objectives" name="objectives" rows={2} defaultValue={project.objectives ?? ""} />
                </FormField>
                <FormField label="Description" htmlFor="edit-project-description">
                  <Textarea id="edit-project-description" name="description" rows={3} defaultValue={project.description ?? ""} />
                </FormField>
              </FormDialog>
            ) : null}
            {canDelete ? (
              <ConfirmDialog
                trigger={
                  <Button variant="outline" className="text-danger">
                    <Trash2 /> Supprimer
                  </Button>
                }
                title="Supprimer ce projet ?"
                description="Le projet sera archivé. Les tâches restent consultables mais le projet n'apparaîtra plus dans la liste."
                confirmLabel="Supprimer le projet"
                action={deleteProjectAction}
                fields={{ id: project.id }}
              />
            ) : null}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <InfoCard label="Avancement" value={`${project.progress}%`} hint={`${tasks.filter((task) => task.status === "done").length}/${tasks.length} tâches terminées`} />
        <InfoCard label="Budget prévisionnel" value={formatMoney(project.budget_minor, project.currency)} hint={`Devise ${project.currency}`} />
        <InfoCard label="Période" value={`${formatDate(project.start_date)} → ${formatDate(project.end_date)}`} hint={project.customer_name ?? "Sans client"} />
        <InfoCard label="Priorité" value={<PriorityBadge priority={project.priority} />} hint={project.department_name ?? "Sans département"} />
      </div>

      {project.objectives ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="size-4" /> Objectifs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line text-sm text-muted-foreground">{project.objectives}</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Jalons</CardTitle>
              <CardDescription>Cochez un jalon lorsqu&apos;il est atteint.</CardDescription>
            </div>
            {canUpdate ? (
              <FormDialog
                trigger={
                  <Button size="sm" variant="outline">
                    <Plus /> Ajouter
                  </Button>
                }
                title="Ajouter un jalon"
                action={addMilestoneAction}
                submitLabel="Ajouter le jalon"
              >
                <input type="hidden" name="projectId" value={project.id} />
                <FormField label="Titre" htmlFor="milestone-title" required>
                  <Input id="milestone-title" name="title" required maxLength={160} />
                </FormField>
                <FormField label="Échéance" htmlFor="milestone-date">
                  <Input id="milestone-date" name="dueDate" type="date" />
                </FormField>
                <FormField label="Description" htmlFor="milestone-description">
                  <Textarea id="milestone-description" name="description" rows={2} />
                </FormField>
              </FormDialog>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-2">
            {milestones.length === 0 ? (
              <EmptyState title="Aucun jalon" description="Découpez le projet en étapes mesurables." />
            ) : (
              milestones.map((milestone) => (
                <div key={milestone.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                  {canUpdate ? (
                    <QuickActionButton
                      action={toggleMilestoneAction}
                      fields={{ id: milestone.id, projectId: project.id }}
                      label=""
                      variant="ghost"
                      icon={
                        milestone.completed_at ? (
                          <CheckCircle2 className="size-4 text-success" />
                        ) : (
                          <Circle className="size-4 text-muted-foreground" />
                        )
                      }
                      successMessage="Jalon mis à jour."
                    />
                  ) : milestone.completed_at ? (
                    <CheckCircle2 className="size-4 text-success" />
                  ) : (
                    <Circle className="size-4 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm ${milestone.completed_at ? "text-muted-foreground line-through" : ""}`}>
                      {milestone.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {milestone.due_date ? `Échéance : ${formatDate(milestone.due_date)}` : "Sans échéance"}
                    </p>
                  </div>
                  {canUpdate ? (
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="icon" aria-label="Supprimer le jalon">
                          <Trash2 className="size-3.5 text-danger" />
                        </Button>
                      }
                      title="Supprimer ce jalon ?"
                      confirmLabel="Supprimer"
                      action={deleteMilestoneAction}
                      fields={{ id: milestone.id, projectId: project.id }}
                    />
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Équipe projet</CardTitle>
              <CardDescription>Membres ayant accès au suivi du projet.</CardDescription>
            </div>
            {canUpdate ? (
              <FormDialog
                trigger={
                  <Button size="sm" variant="outline">
                    <UserPlus /> Ajouter
                  </Button>
                }
                title="Ajouter un membre"
                action={addProjectMemberAction}
                submitLabel="Ajouter"
              >
                <input type="hidden" name="projectId" value={project.id} />
                <FormField label="Collaborateur" htmlFor="member-user" required>
                  <NativeSelect id="member-user" name="userId" required defaultValue="">
                    <option value="" disabled>
                      Sélectionner…
                    </option>
                    {teamMembers.map((member) => (
                      <option key={member.user_id} value={member.user_id}>
                        {member.full_name}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
                <FormField label="Rôle" htmlFor="member-role">
                  <NativeSelect id="member-role" name="role" defaultValue="member">
                    <option value="manager">Responsable</option>
                    <option value="member">Membre</option>
                    <option value="observer">Observateur</option>
                  </NativeSelect>
                </FormField>
              </FormDialog>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-2">
            {members.length === 0 ? (
              <EmptyState title="Aucun membre" description="Ajoutez les collaborateurs impliqués." />
            ) : (
              members.map((member) => (
                <div key={member.user_id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{member.full_name}</p>
                    <p className="text-xs text-muted-foreground">{member.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                      {member.role === "manager" ? "Responsable" : member.role === "observer" ? "Observateur" : "Membre"}
                    </span>
                    {canUpdate ? (
                      <QuickActionButton
                        action={removeProjectMemberAction}
                        fields={{ projectId: project.id, userId: member.user_id }}
                        label=""
                        variant="ghost"
                        icon={<Trash2 className="size-3.5 text-danger" />}
                        successMessage="Membre retiré."
                      />
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tâches du projet</CardTitle>
          <CardDescription>{tasks.length} tâche(s) rattachée(s)</CardDescription>
        </CardHeader>
        {tasks.length === 0 ? (
          <CardContent>
            <EmptyState title="Aucune tâche" description="Créez des tâches depuis le module Tâches en sélectionnant ce projet." />
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tâche</TableHead>
                <TableHead>Assignée à</TableHead>
                <TableHead>Échéance</TableHead>
                <TableHead>Priorité</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell>
                    <Link href={`/app/taches?task=${task.id}`} className="font-medium hover:text-primary">
                      {task.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs">{task.assignee_name ?? "—"}</TableCell>
                  <TableCell className="text-xs">{formatDate(task.due_date)}</TableCell>
                  <TableCell>
                    <PriorityBadge priority={task.priority} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={task.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {documents.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Documents du projet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {documents.map((document) => (
              <a
                key={document.id}
                href={`/api/documents/${document.id}`}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
              >
                <FileText className="size-4 text-muted-foreground" />
                <span className="truncate">{document.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">{formatDate(document.created_at)}</span>
              </a>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function InfoCard({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="card-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
