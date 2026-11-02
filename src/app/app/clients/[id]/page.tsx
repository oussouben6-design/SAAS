import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Mail, MapPin, Pencil, Phone, Plus, Trash2, UserPlus } from "lucide-react";
import { requirePagePermission, can } from "@/lib/server/context";
import { getCustomer, listCategories, CUSTOMER_STATUS_LABELS } from "@/modules/crm/service";
import { AppError } from "@/lib/server/errors";
import { PageHeader, EmptyState, Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { FormDialog } from "@/components/forms/form-dialog";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { StatusBadge } from "@/components/shared/filters";
import {
  addContactAction,
  addInteractionAction,
  deleteContactAction,
  deleteCustomerAction,
  deleteInteractionAction,
  updateCustomerAction,
} from "@/modules/crm/actions";
import { formatDate, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Fiche client" };

const INTERACTION_LABELS: Record<string, string> = {
  note: "Note",
  call: "Appel",
  email: "E-mail",
  meeting: "Réunion",
  visit: "Visite",
  other: "Autre",
};

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requirePagePermission("crm", "read");
  const { id } = await params;
  const orgCtx = { userId: context.user.id, organizationId: context.organization!.id };

  let data;
  try {
    data = await getCustomer(orgCtx, id);
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") notFound();
    throw error;
  }
  const categories = await listCategories(orgCtx);
  const { customer, contacts, interactions, documents, projects } = data;

  const canUpdate = can(context, "crm", "update");
  const canCreate = can(context, "crm", "create");
  const canDelete = can(context, "crm", "delete");

  const customerFields = (
    <>
      <FormField label="Nom du client" htmlFor="edit-name" required>
        <Input id="edit-name" name="name" defaultValue={customer.name} required maxLength={160} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Catégorie" htmlFor="edit-category">
          <NativeSelect id="edit-category" name="categoryId" defaultValue={customer.category_id ?? ""}>
            <option value="">Aucune</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Statut" htmlFor="edit-status">
          <NativeSelect id="edit-status" name="status" defaultValue={customer.status}>
            {Object.entries(CUSTOMER_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="E-mail" htmlFor="edit-email">
          <Input id="edit-email" name="email" type="email" defaultValue={customer.email ?? ""} />
        </FormField>
        <FormField label="Téléphone" htmlFor="edit-phone">
          <Input id="edit-phone" name="phone" defaultValue={customer.phone ?? ""} />
        </FormField>
        <FormField label="Site web" htmlFor="edit-website">
          <Input id="edit-website" name="website" defaultValue={customer.website ?? ""} />
        </FormField>
        <FormField label="Identifiant fiscal" htmlFor="edit-tax">
          <Input id="edit-tax" name="taxId" defaultValue={customer.tax_id ?? ""} />
        </FormField>
        <FormField label="Adresse" htmlFor="edit-address">
          <Input id="edit-address" name="address" defaultValue={customer.address ?? ""} />
        </FormField>
        <FormField label="Ville" htmlFor="edit-city">
          <Input id="edit-city" name="city" defaultValue={customer.city ?? ""} />
        </FormField>
        <FormField label="Pays" htmlFor="edit-country">
          <Input id="edit-country" name="country" defaultValue={customer.country ?? ""} />
        </FormField>
      </div>
      <FormField label="Notes internes" htmlFor="edit-notes">
        <Textarea id="edit-notes" name="notes" rows={4} defaultValue={customer.notes ?? ""} />
      </FormField>
    </>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/app/clients" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Clients
        </Link>
      </div>

      <PageHeader
        title={customer.name}
        description={customer.category_name ? `Catégorie : ${customer.category_name}` : "Aucune catégorie"}
        badge={<StatusBadge status={customer.status} />}
        actions={
          <>
            {canUpdate ? (
              <FormDialog
                trigger={
                  <Button variant="outline">
                    <Pencil /> Modifier
                  </Button>
                }
                title="Modifier le client"
                description="Les modifications sont journalisées dans l'audit."
                action={updateCustomerAction}
                submitLabel="Enregistrer"
                className="max-w-2xl"
              >
                <input type="hidden" name="id" value={customer.id} />
                {customerFields}
              </FormDialog>
            ) : null}
            {canDelete ? (
              <ConfirmDialog
                trigger={
                  <Button variant="outline" className="text-danger">
                    <Trash2 /> Supprimer
                  </Button>
                }
                title="Supprimer ce client ?"
                description="La fiche sera archivée (suppression logique). Les projets, factures et documents associés sont conservés."
                confirmLabel="Supprimer le client"
                action={deleteCustomerAction}
                fields={{ id: customer.id }}
                successMessage="Client supprimé."
              />
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Coordonnées</CardTitle>
            <CardDescription>Créé le {formatDate(customer.created_at)} · modifié le {formatDateTime(customer.updated_at)}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Info icon={<Mail />} label="E-mail" value={customer.email} />
            <Info icon={<Phone />} label="Téléphone" value={customer.phone} />
            <Info icon={<MapPin />} label="Adresse" value={[customer.address, customer.city, customer.country].filter(Boolean).join(", ") || null} />
            <Info icon={<FileText />} label="Site web" value={customer.website} />
            <Info label="Identifiant fiscal" value={customer.tax_id} />
            <Info label="Responsable" value={customer.owner_name} />
          </CardContent>
          {customer.notes ? (
            <>
              <CardHeader className="border-t">
                <CardTitle>Notes internes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-line text-sm text-muted-foreground">{customer.notes}</p>
              </CardContent>
            </>
          ) : null}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Projets associés</CardTitle>
            <CardDescription>{projects.length} projet(s)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun projet lié à ce client.</p>
            ) : (
              projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/app/projets/${project.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
                >
                  <span className="truncate">{project.name}</span>
                  <Badge variant="outline">{project.progress}%</Badge>
                </Link>
              ))
            )}
          </CardContent>
          {documents.length > 0 ? (
            <>
              <CardHeader className="border-t">
                <CardTitle>Documents</CardTitle>
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
                  </a>
                ))}
              </CardContent>
            </>
          ) : null}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Contacts</CardTitle>
              <CardDescription>Interlocuteurs rattachés à ce client.</CardDescription>
            </div>
            {canCreate ? (
              <FormDialog
                trigger={
                  <Button size="sm" variant="outline">
                    <UserPlus /> Ajouter
                  </Button>
                }
                title="Ajouter un contact"
                action={addContactAction}
                submitLabel="Ajouter le contact"
              >
                <input type="hidden" name="customerId" value={customer.id} />
                <FormField label="Nom complet" htmlFor="contact-name" required>
                  <Input id="contact-name" name="fullName" required maxLength={120} />
                </FormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Fonction" htmlFor="contact-role">
                    <Input id="contact-role" name="roleTitle" maxLength={120} />
                  </FormField>
                  <FormField label="E-mail" htmlFor="contact-email">
                    <Input id="contact-email" name="email" type="email" />
                  </FormField>
                  <FormField label="Téléphone" htmlFor="contact-phone">
                    <Input id="contact-phone" name="phone" />
                  </FormField>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isPrimary" className="size-4 rounded border-input" />
                  Contact principal
                </label>
              </FormDialog>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-2">
            {contacts.length === 0 ? (
              <EmptyState title="Aucun contact" description="Ajoutez au moins un interlocuteur pour ce client." />
            ) : (
              contacts.map((contact) => (
                <div key={contact.id} className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {contact.full_name}
                      {contact.is_primary ? <Badge variant="primary" className="ml-2">Principal</Badge> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[contact.role_title, contact.email, contact.phone].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  {canDelete ? (
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="icon" aria-label="Supprimer le contact">
                          <Trash2 className="size-4 text-danger" />
                        </Button>
                      }
                      title="Supprimer ce contact ?"
                      description={`${contact.full_name} sera retiré de la fiche client.`}
                      confirmLabel="Supprimer"
                      action={deleteContactAction}
                      fields={{ id: contact.id, customerId: customer.id }}
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
              <CardTitle>Historique des échanges</CardTitle>
              <CardDescription>Appels, e-mails, réunions et notes internes.</CardDescription>
            </div>
            {canCreate ? (
              <FormDialog
                trigger={
                  <Button size="sm" variant="outline">
                    <Plus /> Enregistrer
                  </Button>
                }
                title="Enregistrer un échange"
                action={addInteractionAction}
                submitLabel="Enregistrer"
              >
                <input type="hidden" name="customerId" value={customer.id} />
                <FormField label="Objet" htmlFor="interaction-subject" required>
                  <Input id="interaction-subject" name="subject" required maxLength={160} />
                </FormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Type" htmlFor="interaction-type">
                    <NativeSelect id="interaction-type" name="type" defaultValue="call">
                      {Object.entries(INTERACTION_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Date et heure" htmlFor="interaction-date" required>
                    <Input
                      id="interaction-date"
                      name="occurredAt"
                      type="datetime-local"
                      required
                      defaultValue={new Date().toISOString().slice(0, 16)}
                    />
                  </FormField>
                </div>
                <FormField label="Compte rendu" htmlFor="interaction-notes">
                  <Textarea id="interaction-notes" name="notes" rows={3} />
                </FormField>
              </FormDialog>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-2">
            {interactions.length === 0 ? (
              <EmptyState title="Aucun échange enregistré" description="Documentez vos échanges pour garder l'historique." />
            ) : (
              interactions.map((interaction) => (
                <div key={interaction.id} className="rounded-lg border border-border px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        <Badge variant="outline" className="mr-2">
                          {INTERACTION_LABELS[interaction.type] ?? interaction.type}
                        </Badge>
                        {interaction.subject}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(interaction.occurred_at)} · {interaction.author ?? "Auteur inconnu"}
                      </p>
                    </div>
                    {canDelete ? (
                      <ConfirmDialog
                        trigger={
                          <Button variant="ghost" size="icon" aria-label="Supprimer l'échange">
                            <Trash2 className="size-4 text-danger" />
                          </Button>
                        }
                        title="Supprimer cet échange ?"
                        confirmLabel="Supprimer"
                        action={deleteInteractionAction}
                        fields={{ id: interaction.id, customerId: customer.id }}
                      />
                    ) : null}
                  </div>
                  {interaction.notes ? (
                    <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{interaction.notes}</p>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {!canUpdate ? (
        <Alert variant="info">Votre rôle permet la consultation de cette fiche, sans modification.</Alert>
      ) : null}
    </div>
  );
}

function Info({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string | null }) {
  return (
    <div className="space-y-0.5">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon ? <span className="[&_svg]:size-3.5">{icon}</span> : null}
        {label}
      </p>
      <p className="text-sm">{value || "—"}</p>
    </div>
  );
}
