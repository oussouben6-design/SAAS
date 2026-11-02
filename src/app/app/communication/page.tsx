import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Megaphone, Pin, Trash2 } from "lucide-react";
import { requirePagePermission, can } from "@/lib/server/context";
import { listAnnouncements, listEvents } from "@/modules/communication/service";
import { listDepartments } from "@/modules/organization/service";
import { listProjects } from "@/modules/projects/service";
import { Alert, EmptyState, PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { FormDialog } from "@/components/forms/form-dialog";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { formatDate, formatDateTime } from "@/lib/utils";
import {
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_AUDIENCE_LABELS,
} from "@/lib/validation/communication";
import {
  createAnnouncementAction,
  createEventAction,
  deleteAnnouncementAction,
  deleteEventAction,
} from "@/modules/communication/actions";

export const metadata: Metadata = { title: "Communication" };

const VIEWS = [
  { key: "annonces", label: "Annonces" },
  { key: "calendrier", label: "Calendrier" },
] as const;

export default async function CommunicationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const context = await requirePagePermission("communication", "read");
  const params = await searchParams;
  const view = (VIEWS.find((item) => item.key === params.vue)?.key ?? "annonces") as
    | "annonces"
    | "calendrier";
  const orgCtx = { userId: context.user.id, organizationId: context.organization!.id };

  const canCreate = can(context, "communication", "create");
  const canDelete = can(context, "communication", "delete");

  const [announcements, events, departments, projects] = await Promise.all([
    view === "annonces" ? listAnnouncements(orgCtx, { includeExpired: true }) : Promise.resolve([]),
    view === "calendrier" ? listEvents(orgCtx) : Promise.resolve([]),
    listDepartments(orgCtx),
    can(context, "projects", "read") ? listProjects(orgCtx, { pageSize: 100 }) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Communication"
        description="Annonces internes et calendrier partagé de l'organisation."
        actions={
          canCreate ? (
            view === "annonces" ? (
              <FormDialog
                trigger={
                  <Button>
                    <Megaphone /> Nouvelle annonce
                  </Button>
                }
                title="Publier une annonce"
                action={createAnnouncementAction}
                submitLabel="Publier"
              >
                <FormField label="Titre" htmlFor="announcement-title" required>
                  <Input id="announcement-title" name="title" required maxLength={200} />
                </FormField>
                <FormField label="Contenu" htmlFor="announcement-body" required>
                  <Textarea id="announcement-body" name="body" rows={4} required maxLength={5000} />
                </FormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Audience" htmlFor="announcement-audience">
                    <NativeSelect id="announcement-audience" name="audience" defaultValue="all">
                      {ANNOUNCEMENT_AUDIENCES.map((audience) => (
                        <option key={audience} value={audience}>
                          {ANNOUNCEMENT_AUDIENCE_LABELS[audience]}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Département (si audience ciblée)" htmlFor="announcement-department">
                    <NativeSelect id="announcement-department" name="departmentId" defaultValue="">
                      <option value="">Aucun</option>
                      {departments.map((department) => (
                        <option key={department.id} value={department.id}>
                          {department.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Expire le" htmlFor="announcement-expires">
                    <Input id="announcement-expires" name="expiresAt" type="date" />
                  </FormField>
                  <FormField label="Épingler en tête" htmlFor="announcement-pinned">
                    <input id="announcement-pinned" name="isPinned" type="checkbox" className="size-4" />
                  </FormField>
                </div>
              </FormDialog>
            ) : (
              <FormDialog
                trigger={
                  <Button>
                    <CalendarDays /> Nouvel événement
                  </Button>
                }
                title="Créer un événement"
                action={createEventAction}
                submitLabel="Créer"
              >
                <FormField label="Titre" htmlFor="event-title" required>
                  <Input id="event-title" name="title" required maxLength={200} />
                </FormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Début" htmlFor="event-start" required>
                    <Input id="event-start" name="startsAt" type="datetime-local" required />
                  </FormField>
                  <FormField label="Fin" htmlFor="event-end">
                    <Input id="event-end" name="endsAt" type="datetime-local" />
                  </FormField>
                  <FormField label="Lieu" htmlFor="event-location">
                    <Input id="event-location" name="location" maxLength={200} />
                  </FormField>
                  <FormField label="Visibilité" htmlFor="event-visibility">
                    <NativeSelect id="event-visibility" name="visibility" defaultValue="organization">
                      <option value="organization">Toute l&apos;organisation</option>
                      <option value="department">Un département</option>
                      <option value="private">Privé</option>
                    </NativeSelect>
                  </FormField>
                  <FormField label="Département" htmlFor="event-department">
                    <NativeSelect id="event-department" name="departmentId" defaultValue="">
                      <option value="">Aucun</option>
                      {departments.map((department) => (
                        <option key={department.id} value={department.id}>
                          {department.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Projet lié" htmlFor="event-project">
                    <NativeSelect id="event-project" name="projectId" defaultValue="">
                      <option value="">Aucun</option>
                      {projects?.items.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Journée entière" htmlFor="event-allday">
                    <input id="event-allday" name="allDay" type="checkbox" className="size-4" />
                  </FormField>
                </div>
                <FormField label="Description" htmlFor="event-description">
                  <Textarea id="event-description" name="description" rows={2} />
                </FormField>
              </FormDialog>
            )
          ) : null
        }
      />

      <nav className="flex flex-wrap gap-1.5" aria-label="Sections communication">
        {VIEWS.map((item) => (
          <Link
            key={item.key}
            href={`/app/communication?vue=${item.key}`}
            aria-current={view === item.key ? "page" : undefined}
            className={
              view === item.key
                ? "rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                : "rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
            }
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {view === "annonces" ? (
        <div className="space-y-3">
          {announcements.length === 0 ? (
            <EmptyState
              icon={<Megaphone />}
              title="Aucune annonce"
              description="Publiez une annonce pour informer les collaborateurs."
            />
          ) : (
            announcements.map((announcement) => (
              <Card key={announcement.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {announcement.is_pinned ? <Pin className="size-4 text-warning" /> : null}
                      {announcement.title}
                    </CardTitle>
                    <CardDescription>
                      {formatDate(announcement.published_at)} ·{" "}
                      {ANNOUNCEMENT_AUDIENCE_LABELS[
                        announcement.audience as keyof typeof ANNOUNCEMENT_AUDIENCE_LABELS
                      ] ?? announcement.audience}
                      {announcement.department_name ? ` — ${announcement.department_name}` : ""}
                      {announcement.author ? ` · ${announcement.author}` : ""}
                      {announcement.expires_at ? ` · expire le ${formatDate(announcement.expires_at)}` : ""}
                    </CardDescription>
                  </div>
                  {canDelete ? (
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="sm">
                          <Trash2 />
                        </Button>
                      }
                      title="Supprimer cette annonce ?"
                      confirmLabel="Supprimer"
                      action={deleteAnnouncementAction}
                      fields={{ id: announcement.id }}
                    />
                  ) : null}
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-line text-sm text-muted-foreground">{announcement.body}</p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      ) : null}

      {view === "calendrier" ? (
        <Card>
          <CardHeader>
            <CardTitle>Prochains événements</CardTitle>
            <CardDescription>Événements à venir de votre organisation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {events.length === 0 ? (
              <EmptyState
                icon={<CalendarDays />}
                title="Aucun événement"
                description="Ajoutez réunions, échéances et temps forts au calendrier partagé."
              />
            ) : (
              <ul className="divide-y divide-border">
                {events.map((event) => (
                  <li key={event.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div className="space-y-1">
                      <p className="font-medium">{event.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(event.starts_at)}
                        {event.ends_at ? ` → ${formatDateTime(event.ends_at)}` : ""}
                        {event.location ? ` · ${event.location}` : ""}
                        {event.department_name ? ` · ${event.department_name}` : ""}
                        {event.project_name ? ` · ${event.project_name}` : ""}
                        {event.visibility === "private" ? " · privé" : ""}
                      </p>
                      {event.description ? (
                        <p className="max-w-2xl text-sm text-muted-foreground">{event.description}</p>
                      ) : null}
                    </div>
                    {canDelete ? (
                      <ConfirmDialog
                        trigger={
                          <Button variant="ghost" size="sm">
                            <Trash2 />
                          </Button>
                        }
                        title="Supprimer cet événement ?"
                        confirmLabel="Supprimer"
                        action={deleteEventAction}
                        fields={{ id: event.id }}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Alert variant="info" title="Périmètre">
        Ce module couvre les annonces internes et le calendrier. La messagerie instantanée et les
        notifications temps réel ne sont pas développées.
      </Alert>
    </div>
  );
}
