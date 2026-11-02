import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Handshake, Plus, Trash2 } from "lucide-react";
import { requirePagePermission, can } from "@/lib/server/context";
import { getPartner } from "@/modules/partners/service";
import { AppError } from "@/lib/server/errors";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormDialog } from "@/components/forms/form-dialog";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { StatusBadge } from "@/components/shared/filters";
import { formatDate } from "@/lib/utils";
import {
  AGREEMENT_STATUSES,
  AGREEMENT_STATUS_LABELS,
  PARTNER_STATUSES,
  PARTNER_STATUS_LABELS,
  PARTNER_TYPES,
  PARTNER_TYPE_LABELS,
} from "@/lib/validation/partners";
import {
  addAgreementAction,
  addPartnerContactAction,
  deleteAgreementAction,
  deletePartnerAction,
  deletePartnerContactAction,
  updatePartnerAction,
} from "@/modules/partners/actions";

export const metadata: Metadata = { title: "Partenaire" };

export default async function PartnerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requirePagePermission("partners", "read");
  const { id } = await params;
  const orgCtx = { userId: context.user.id, organizationId: context.organization!.id };

  let data;
  try {
    data = await getPartner(orgCtx, id);
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") notFound();
    throw error;
  }
  const { partner, contacts, agreements } = data;

  const canCreate = can(context, "partners", "create");
  const canUpdate = can(context, "partners", "update");
  const canDelete = can(context, "partners", "delete");

  return (
    <div className="space-y-5">
      <Link href="/app/partenaires" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Partenaires
      </Link>

      <PageHeader
        title={partner.name}
        description={[
          PARTNER_TYPE_LABELS[partner.type as keyof typeof PARTNER_TYPE_LABELS] ?? partner.type,
          partner.city,
          partner.country,
          partner.email,
        ]
          .filter(Boolean)
          .join(" · ")}
        badge={
          <StatusBadge
            status={partner.status}
            label={PARTNER_STATUS_LABELS[partner.status as keyof typeof PARTNER_STATUS_LABELS]}
          />
        }
        actions={
          <>
            {canUpdate ? (
              <FormDialog
                trigger={
                  <Button variant="outline">
                    <Handshake /> Modifier
                  </Button>
                }
                title="Modifier le partenaire"
                action={updatePartnerAction}
                submitLabel="Enregistrer"
              >
                <input type="hidden" name="id" value={partner.id} />
                <FormField label="Nom" htmlFor="edit-partner-name" required>
                  <Input id="edit-partner-name" name="name" required defaultValue={partner.name} maxLength={160} />
                </FormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Type" htmlFor="edit-partner-type">
                    <NativeSelect id="edit-partner-type" name="type" defaultValue={partner.type}>
                      {PARTNER_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {PARTNER_TYPE_LABELS[type]}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Statut" htmlFor="edit-partner-status">
                    <NativeSelect id="edit-partner-status" name="status" defaultValue={partner.status}>
                      {PARTNER_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {PARTNER_STATUS_LABELS[status]}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="E-mail" htmlFor="edit-partner-email">
                    <Input id="edit-partner-email" name="email" type="email" defaultValue={partner.email ?? ""} />
                  </FormField>
                  <FormField label="Téléphone" htmlFor="edit-partner-phone">
                    <Input id="edit-partner-phone" name="phone" defaultValue={partner.phone ?? ""} maxLength={40} />
                  </FormField>
                  <FormField label="Ville" htmlFor="edit-partner-city">
                    <Input id="edit-partner-city" name="city" defaultValue={partner.city ?? ""} maxLength={120} />
                  </FormField>
                  <FormField label="Pays" htmlFor="edit-partner-country">
                    <Input id="edit-partner-country" name="country" defaultValue={partner.country ?? ""} maxLength={120} />
                  </FormField>
                  <FormField label="Site web" htmlFor="edit-partner-website">
                    <Input id="edit-partner-website" name="website" defaultValue={partner.website ?? ""} maxLength={200} />
                  </FormField>
                  <FormField label="Contact principal" htmlFor="edit-partner-contact">
                    <Input id="edit-partner-contact" name="contactPerson" defaultValue={partner.contact_person ?? ""} maxLength={120} />
                  </FormField>
                </div>
                <FormField label="Adresse" htmlFor="edit-partner-address">
                  <Input id="edit-partner-address" name="address" defaultValue={partner.address ?? ""} maxLength={300} />
                </FormField>
                <FormField label="Notes" htmlFor="edit-partner-notes">
                  <Textarea id="edit-partner-notes" name="notes" rows={2} defaultValue={partner.notes ?? ""} />
                </FormField>
              </FormDialog>
            ) : null}
            {canDelete ? (
              <ConfirmDialog
                trigger={
                  <Button variant="ghost" size="sm">
                    <Trash2 /> Archiver
                  </Button>
                }
                title="Archiver ce partenaire ?"
                description="Le partenaire sera retiré des listes (suppression logique). Les conventions restent en base et l'opération est journalisée."
                confirmLabel="Archiver"
                action={deletePartnerAction}
                fields={{ id: partner.id }}
              />
            ) : null}
          </>
        }
      />

      {partner.notes ? (
        <Card>
          <CardHeader>
            <CardTitle>Notes internes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line text-sm text-muted-foreground">{partner.notes}</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Contacts</CardTitle>
              <CardDescription>{contacts.length} contact(s) référencé(s).</CardDescription>
            </div>
            {canCreate ? (
              <FormDialog
                trigger={
                  <Button variant="outline" size="sm">
                    <Plus /> Contact
                  </Button>
                }
                title="Ajouter un contact"
                action={addPartnerContactAction}
                submitLabel="Ajouter"
              >
                <input type="hidden" name="partnerId" value={partner.id} />
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
                    <Input id="contact-phone" name="phone" maxLength={40} />
                  </FormField>
                  <FormField label="Contact principal" htmlFor="contact-primary">
                    <input id="contact-primary" name="isPrimary" type="checkbox" className="size-4" />
                  </FormField>
                </div>
              </FormDialog>
            ) : null}
          </CardHeader>
          <CardContent className="p-0">
            {contacts.length === 0 ? (
              <div className="p-4">
                <EmptyState icon={<Plus />} title="Aucun contact" description="Ajoutez les interlocuteurs de ce partenaire." />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Fonction</TableHead>
                    <TableHead>Coordonnées</TableHead>
                    <TableHead className="text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.map((contact) => (
                    <TableRow key={contact.id}>
                      <TableCell className="font-medium">
                        {contact.full_name}
                        {contact.is_primary ? (
                          <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[11px] text-accent-foreground">
                            Principal
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>{contact.role_title ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {[contact.email, contact.phone].filter(Boolean).join(" · ") || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {canDelete ? (
                          <ConfirmDialog
                            trigger={
                              <Button variant="ghost" size="sm">
                                <Trash2 />
                              </Button>
                            }
                            title="Supprimer ce contact ?"
                            confirmLabel="Supprimer"
                            action={deletePartnerContactAction}
                            fields={{ partnerId: partner.id, contactId: contact.id }}
                          />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Conventions</CardTitle>
              <CardDescription>Accords et contrats-cadres avec ce partenaire.</CardDescription>
            </div>
            {canCreate ? (
              <FormDialog
                trigger={
                  <Button variant="outline" size="sm">
                    <FileText /> Convention
                  </Button>
                }
                title="Ajouter une convention"
                action={addAgreementAction}
                submitLabel="Enregistrer"
              >
                <input type="hidden" name="partnerId" value={partner.id} />
                <FormField label="Titre" htmlFor="agreement-title" required>
                  <Input id="agreement-title" name="title" required maxLength={200} />
                </FormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Référence" htmlFor="agreement-reference">
                    <Input id="agreement-reference" name="reference" maxLength={60} />
                  </FormField>
                  <FormField label="Statut" htmlFor="agreement-status">
                    <NativeSelect id="agreement-status" name="status" defaultValue="draft">
                      {AGREEMENT_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {AGREEMENT_STATUS_LABELS[status]}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Début" htmlFor="agreement-start">
                    <Input id="agreement-start" name="startDate" type="date" />
                  </FormField>
                  <FormField label="Fin" htmlFor="agreement-end">
                    <Input id="agreement-end" name="endDate" type="date" />
                  </FormField>
                </div>
                <FormField label="Notes" htmlFor="agreement-notes">
                  <Textarea id="agreement-notes" name="notes" rows={2} />
                </FormField>
              </FormDialog>
            ) : null}
          </CardHeader>
          <CardContent className="p-0">
            {agreements.length === 0 ? (
              <div className="p-4">
                <EmptyState icon={<FileText />} title="Aucune convention" description="Consignez ici les accords signés avec ce partenaire." />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Titre</TableHead>
                    <TableHead>Période</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agreements.map((agreement) => (
                    <TableRow key={agreement.id}>
                      <TableCell>
                        <p className="font-medium">{agreement.title}</p>
                        {agreement.reference ? (
                          <p className="text-xs text-muted-foreground">{agreement.reference}</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDate(agreement.start_date)} → {formatDate(agreement.end_date)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={agreement.status}
                          label={AGREEMENT_STATUS_LABELS[agreement.status as keyof typeof AGREEMENT_STATUS_LABELS]}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        {canDelete ? (
                          <ConfirmDialog
                            trigger={
                              <Button variant="ghost" size="sm">
                                <Trash2 />
                              </Button>
                            }
                            title="Supprimer cette convention ?"
                            description="La convention sera définitivement supprimée de la base."
                            confirmLabel="Supprimer"
                            action={deleteAgreementAction}
                            fields={{ partnerId: partner.id, agreementId: agreement.id }}
                          />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
