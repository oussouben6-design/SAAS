import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Columns3, List, Plus, Trash2 } from "lucide-react";
import { requirePagePermission, can } from "@/lib/server/context";
import {
  getTask,
  listAssignableMembers,
  listTasks,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
} from "@/modules/tasks/service";
import { listProjects } from "@/modules/projects/service";
import { AppError } from "@/lib/server/errors";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormDialog } from "@/components/forms/form-dialog";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { QuickActionForm } from "@/components/forms/quick-action";
import { FilterBar, PriorityBadge } from "@/components/shared/filters";
import {
  addCommentAction,
  createTaskAction,
  deleteCommentAction,
  deleteTaskAction,
  updateTaskAction,
  updateTaskStatusAction,
} from "@/modules/tasks/actions";
import { formatDate, formatDateTime } from "@/lib/utils";
import { PRIORITIES } from "@/lib/validation/projects";

export const metadata: Metadata = { title: "Tâches" };

type View = "list" | "board" | "calendar";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    q?: string;
    status?: string;
    assignee?: string;
    project?: string;
    task?: string;
    month?: string;
  }>;
}) {
  const context = await requirePagePermission("tasks", "read");
  const params = await searchParams;
  const orgCtx = { userId: context.user.id, organizationId: context.organization!.id };
  const view: View = params.view === "board" ? "board" : params.view === "calendar" ? "calendar" : "list";

  const [tasks, members, projects] = await Promise.all([
    listTasks(orgCtx, {
      q: params.q,
      status: params.status,
      assigneeId: params.assignee,
      projectId: params.project,
    }),
    listAssignableMembers(orgCtx),
    listProjects(orgCtx, { pageSize: 50 }),
  ]);

  const selectedTask = params.task
    ? await getTask(orgCtx, params.task).catch((error) => {
        if (error instanceof AppError && error.code === "not_found") return null;
        throw error;
      })
    : null;

  const canCreate = can(context, "tasks", "create");
  const canUpdate = can(context, "tasks", "update");
  const canDelete = can(context, "tasks", "delete");

  const taskForm = (task?: NonNullable<typeof selectedTask>["task"]) => (
    <>
      {task ? <input type="hidden" name="id" value={task.id} /> : null}
      <FormField label="Titre" htmlFor={`task-title-${task?.id ?? "new"}`} required>
        <Input id={`task-title-${task?.id ?? "new"}`} name="title" defaultValue={task?.title} required maxLength={200} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Projet" htmlFor={`task-project-${task?.id ?? "new"}`}>
          <NativeSelect
            id={`task-project-${task?.id ?? "new"}`}
            name="projectId"
            defaultValue={task?.project_id ?? params.project ?? ""}
          >
            <option value="">Sans projet</option>
            {projects.items.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Assignée à" htmlFor={`task-assignee-${task?.id ?? "new"}`}>
          <NativeSelect id={`task-assignee-${task?.id ?? "new"}`} name="assigneeId" defaultValue={task?.assignee_id ?? ""}>
            <option value="">Non assignée</option>
            {members.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.full_name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Statut" htmlFor={`task-status-${task?.id ?? "new"}`}>
          <NativeSelect id={`task-status-${task?.id ?? "new"}`} name="status" defaultValue={task?.status ?? "todo"}>
            {TASK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {TASK_STATUS_LABELS[status]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Priorité" htmlFor={`task-priority-${task?.id ?? "new"}`}>
          <NativeSelect id={`task-priority-${task?.id ?? "new"}`} name="priority" defaultValue={task?.priority ?? "medium"}>
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {TASK_PRIORITY_LABELS[priority]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Échéance" htmlFor={`task-due-${task?.id ?? "new"}`}>
          <Input id={`task-due-${task?.id ?? "new"}`} name="dueDate" type="date" defaultValue={task?.due_date ?? ""} />
        </FormField>
      </div>
      <FormField label="Description" htmlFor={`task-description-${task?.id ?? "new"}`}>
        <Textarea id={`task-description-${task?.id ?? "new"}`} name="description" rows={3} defaultValue={task?.description ?? ""} />
      </FormField>
    </>
  );

  const viewLink = (target: View) => {
    const search = new URLSearchParams();
    if (params.q) search.set("q", params.q);
    if (params.status) search.set("status", params.status);
    if (params.assignee) search.set("assignee", params.assignee);
    if (params.project) search.set("project", params.project);
    if (target !== "list") search.set("view", target);
    return `/app/taches${search.toString() ? `?${search.toString()}` : ""}`;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tâches"
        description="Suivi opérationnel : liste filtrable, tableau kanban et calendrier des échéances."
        actions={
          <>
            <div className="flex rounded-lg border border-border bg-card p-1">
              <Link
                href={viewLink("list")}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                <List className="size-3.5" /> Liste
              </Link>
              <Link
                href={viewLink("board")}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${view === "board" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                <Columns3 className="size-3.5" /> Kanban
              </Link>
              <Link
                href={viewLink("calendar")}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${view === "calendar" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                <CalendarDays className="size-3.5" /> Calendrier
              </Link>
            </div>
            {canCreate ? (
              <FormDialog
                trigger={
                  <Button>
                    <Plus /> Nouvelle tâche
                  </Button>
                }
                title="Créer une tâche"
                action={createTaskAction}
                submitLabel="Créer la tâche"
                className="max-w-2xl"
              >
                {taskForm()}
              </FormDialog>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card className="p-4">
            <FilterBar action="/app/taches" q={params.q} placeholder="Titre ou description…" hidden={{ view: params.view }}>
              <NativeSelect name="status" defaultValue={params.status ?? ""} className="w-auto min-w-[140px]">
                <option value="">Tous les statuts</option>
                {TASK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {TASK_STATUS_LABELS[status]}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect name="assignee" defaultValue={params.assignee ?? ""} className="w-auto min-w-[150px]">
                <option value="">Tous les collaborateurs</option>
                {members.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.full_name}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect name="project" defaultValue={params.project ?? ""} className="w-auto min-w-[150px]">
                <option value="">Tous les projets</option>
                {projects.items.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </NativeSelect>
            </FilterBar>
          </Card>

          {tasks.length === 0 ? (
            <Card className="p-6">
              <EmptyState
                title="Aucune tâche"
                description="Créez une tâche ou modifiez les filtres pour afficher des résultats."
              />
            </Card>
          ) : view === "list" ? (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tâche</TableHead>
                    <TableHead>Projet</TableHead>
                    <TableHead>Assignée à</TableHead>
                    <TableHead>Échéance</TableHead>
                    <TableHead>Priorité</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((task) => (
                    <TableRow key={task.id} className={params.task === task.id ? "bg-muted/60" : undefined}>
                      <TableCell>
                        <Link href={`/app/taches?view=${view}&task=${task.id}`} className="font-medium hover:text-primary">
                          {task.title}
                        </Link>
                        <div className="flex gap-2 text-[11px] text-muted-foreground">
                          {task.comments_count > 0 ? <span>{task.comments_count} commentaire(s)</span> : null}
                          {task.subtasks_total > 0 ? (
                            <span>
                              {task.subtasks_done}/{task.subtasks_total} sous-tâches
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{task.project_name ?? "—"}</TableCell>
                      <TableCell className="text-xs">{task.assignee_name ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        <span
                          className={
                            task.due_date && task.status !== "done" && new Date(task.due_date) < new Date()
                              ? "font-medium text-danger"
                              : ""
                          }
                        >
                          {formatDate(task.due_date)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <PriorityBadge priority={task.priority} />
                      </TableCell>
                      <TableCell>
                        {canUpdate ? (
                          <QuickActionForm
                            action={updateTaskStatusAction}
                            fields={{ id: task.id }}
                            submitLabel="OK"
                            successMessage="Statut mis à jour."
                          >
                            <NativeSelect
                              name="status"
                              defaultValue={task.status}
                              className="h-8 w-auto min-w-[120px] text-xs"
                              aria-label="Changer le statut"
                            >
                              {TASK_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                  {TASK_STATUS_LABELS[status]}
                                </option>
                              ))}
                            </NativeSelect>
                          </QuickActionForm>
                        ) : (
                          <span className="text-xs">{TASK_STATUS_LABELS[task.status]}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ) : view === "board" ? (
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {TASK_STATUSES.map((status) => {
                const columnTasks = tasks.filter((task) => task.status === status);
                return (
                  <Card key={status} className="p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold">{TASK_STATUS_LABELS[status]}</p>
                      <span className="rounded-full bg-muted px-2 text-xs">{columnTasks.length}</span>
                    </div>
                    <div className="space-y-2">
                      {columnTasks.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-border px-2 py-4 text-center text-xs text-muted-foreground">
                          Vide
                        </p>
                      ) : (
                        columnTasks.map((task) => (
                          <Link
                            key={task.id}
                            href={`/app/taches?view=board&task=${task.id}`}
                            className="block rounded-lg border border-border bg-card p-2.5 hover:border-primary/40"
                          >
                            <p className="text-sm font-medium">{task.title}</p>
                            <p className="text-xs text-muted-foreground">{task.project_name ?? "Sans projet"}</p>
                            <div className="mt-1 flex items-center justify-between">
                              <PriorityBadge priority={task.priority} />
                              <span className="text-[11px] text-muted-foreground">{formatDate(task.due_date)}</span>
                            </div>
                          </Link>
                        ))
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <CalendarView tasks={tasks} />
          )}
        </div>

        <div className="space-y-4">
          {selectedTask ? (
            <>
              <Card>
                <CardHeader className="flex-row items-start justify-between">
                  <div>
                    <CardTitle>{selectedTask.task.title}</CardTitle>
                    <CardDescription>
                      {selectedTask.task.project_name ?? "Sans projet"} · {TASK_STATUS_LABELS[selectedTask.task.status]}
                    </CardDescription>
                  </div>
                  {canUpdate ? (
                    <FormDialog
                      trigger={
                        <Button size="sm" variant="outline">
                          Modifier
                        </Button>
                      }
                      title="Modifier la tâche"
                      action={updateTaskAction}
                      submitLabel="Enregistrer"
                      className="max-w-2xl"
                    >
                      {taskForm(selectedTask.task)}
                    </FormDialog>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="whitespace-pre-line text-muted-foreground">
                    {selectedTask.task.description || "Aucune description."}
                  </p>
                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Assignée à</dt>
                      <dd>{selectedTask.task.assignee_name ?? "Non assignée"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Échéance</dt>
                      <dd>{formatDate(selectedTask.task.due_date)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Priorité</dt>
                      <dd>{TASK_PRIORITY_LABELS[selectedTask.task.priority]}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Créée le</dt>
                      <dd>{formatDate(selectedTask.task.created_at)}</dd>
                    </div>
                  </dl>
                  {canDelete ? (
                    <ConfirmDialog
                      trigger={
                        <Button variant="outline" size="sm" className="text-danger">
                          <Trash2 /> Supprimer la tâche
                        </Button>
                      }
                      title="Supprimer cette tâche ?"
                      description="La suppression est logique ; l'historique d'audit est conservé."
                      confirmLabel="Supprimer"
                      action={deleteTaskAction}
                      fields={{ id: selectedTask.task.id }}
                    />
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Commentaires</CardTitle>
                  <CardDescription>{selectedTask.comments.length} message(s)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selectedTask.comments.map((comment) => (
                    <div key={comment.id} className="rounded-lg border border-border px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-medium">
                          {comment.author ?? "Auteur inconnu"}{" "}
                          <span className="font-normal text-muted-foreground">
                            · {formatDateTime(comment.created_at)}
                          </span>
                        </p>
                        {comment.author_id === context.user.id ? (
                          <ConfirmDialog
                            trigger={
                              <Button variant="ghost" size="icon" aria-label="Supprimer le commentaire">
                                <Trash2 className="size-3.5 text-danger" />
                              </Button>
                            }
                            title="Supprimer ce commentaire ?"
                            confirmLabel="Supprimer"
                            action={deleteCommentAction}
                            fields={{ id: comment.id }}
                          />
                        ) : null}
                      </div>
                      <p className="mt-1 whitespace-pre-line text-sm">{comment.body}</p>
                    </div>
                  ))}
                  <FormDialog
                    trigger={
                      <Button size="sm" variant="outline">
                        Ajouter un commentaire
                      </Button>
                    }
                    title="Nouveau commentaire"
                    action={addCommentAction}
                    submitLabel="Publier"
                  >
                    <input type="hidden" name="taskId" value={selectedTask.task.id} />
                    <FormField label="Commentaire" htmlFor="comment-body" required>
                      <Textarea id="comment-body" name="body" rows={4} required maxLength={4000} />
                    </FormField>
                  </FormDialog>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="p-5">
              <EmptyState
                title="Aucune tâche sélectionnée"
                description="Cliquez sur une tâche pour consulter son détail, ses commentaires et ses pièces jointes."
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function CalendarView({ tasks }: { tasks: Awaited<ReturnType<typeof listTasks>> }) {
  const withDates = tasks.filter((task) => task.due_date);
  if (withDates.length === 0) {
    return (
      <Card className="p-6">
        <EmptyState title="Aucune échéance" description="Ajoutez des dates d'échéance pour utiliser la vue calendrier." />
      </Card>
    );
  }
  const groups = new Map<string, typeof withDates>();
  for (const task of withDates) {
    const key = task.due_date!.slice(0, 10);
    groups.set(key, [...(groups.get(key) ?? []), task]);
  }
  const sorted = Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));

  return (
    <Card className="p-4">
      <div className="space-y-4">
        {sorted.map(([date, entries]) => (
          <div key={date}>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {formatDate(date)}
            </p>
            <div className="space-y-1.5">
              {entries.map((task) => (
                <Link
                  key={task.id}
                  href={`/app/taches?view=calendar&task=${task.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
                >
                  <span className="truncate">{task.title}</span>
                  <span className="flex items-center gap-2">
                    <PriorityBadge priority={task.priority} />
                    <span className="text-xs text-muted-foreground">{TASK_STATUS_LABELS[task.status]}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
