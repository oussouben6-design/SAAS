import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Target, Trash2, TrendingUp, Users } from "lucide-react";
import { requirePagePermission, can } from "@/lib/server/context";
import {
  listLeads,
  listOpportunities,
  listStages,
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
} from "@/modules/prospection/service";
import { listCustomers } from "@/modules/crm/service";
import { listAssignableMembers } from "@/modules/tasks/service";
import { PageHeader, EmptyState, StatCard } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormDialog } from "@/components/forms/form-dialog";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { QuickActionButton, QuickActionForm } from "@/components/forms/quick-action";
import { StatusBadge } from "@/components/shared/filters";
import {
  convertLeadAction,
  createLeadAction,
  createOpportunityAction,
  deleteLeadAction,
  deleteOpportunityAction,
  moveOpportunityAction,
  updateLeadStatusAction,
} from "@/modules/prospection/actions";
import { formatDate, formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Prospection" };

export default async function ProspectionPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const context = await requirePagePermission("prospection", "read");
  const params = await searchParams;
  const orgCtx = { userId: context.user.id, organizationId: context.organization!.id };

  const [leads, stages, opportunities, members] = await Promise.all([
    listLeads(orgCtx, { q: params.q, status: params.status }),
    listStages(orgCtx),
    listOpportunities(orgCtx),
    listAssignableMembers(orgCtx),
  ]);
  const customers = can(context, "crm", "read") ? await listCustomers(orgCtx, { pageSize: 100 }) : null;

  const currency = context.organization!.currency;
  const canCreate = can(context, "prospection", "create");
  const canUpdate = can(context, "prospection", "update");
  const canDelete = can(context, "prospection", "delete");

  const openAmount = opportunities
    .filter((opportunity) => opportunity.status === "open")
    .reduce((sum, opportunity) => sum + Number(opportunity.amount_minor), 0);

  const leadsToConvert = leads.filter((lead) => lead.status !== "converted").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prospection"
        description="Prospects, opportunités et pipeline commercial. Les montants proviennent de vos saisies."
        actions={
          <>
            {canCreate ? (
              <FormDialog
                trigger={
                  <Button variant="outline">
                    <Users /> Nouveau prospect
                  </Button>
                }
                title="Enregistrer un prospect"
                action={createLeadAction}
                submitLabel="Enregistrer le prospect"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Nom du contact" htmlFor="lead-name" required>
                    <Input id="lead-name" name="name" required maxLength={160} />
                  </FormField>
                  <FormField label="Organisation" htmlFor="lead-company">
                    <Input id="lead-company" name="company" maxLength={160} />
                  </FormField>
                  <FormField label="E-mail" htmlFor="lead-email">
                    <Input id="lead-email" name="email" type="email" />
                  </FormField>
                  <FormField label="Téléphone" htmlFor="lead-phone">
                    <Input id="lead-phone" name="phone" />
                  </FormField>
                  <FormField label="Source" htmlFor="lead-source">
                    <NativeSelect id="lead-source" name="source" defaultValue="direct">
                      {Object.entries(LEAD_SOURCE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Statut" htmlFor="lead-status">
                    <NativeSelect id="lead-status" name="status" defaultValue="new">
                      {Object.entries(LEAD_STATUS_LABELS)
                        .filter(([value]) => value !== "converted")
                        .map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Relance prévue le" htmlFor="lead-followup">
                    <Input id="lead-followup" name="nextFollowUpAt" type="date" />
                  </FormField>
                  <FormField label="Responsable" htmlFor="lead-owner">
                    <NativeSelect id="lead-owner" name="ownerId" defaultValue={context.user.id}>
                      {members.map((member) => (
                        <option key={member.user_id} value={member.user_id}>
                          {member.full_name}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                </div>
                <FormField label="Notes" htmlFor="lead-notes">
                  <Textarea id="lead-notes" name="notes" rows={3} />
                </FormField>
              </FormDialog>
            ) : null}
            {canCreate ? (
              <FormDialog
                trigger={
                  <Button>
                    <Plus /> Nouvelle opportunité
                  </Button>
                }
                title="Créer une opportunité"
                description="Le montant est enregistré au centime près dans la devise de l'organisation."
                action={createOpportunityAction}
                submitLabel="Créer l'opportunité"
              >
                <FormField label="Nom de l'opportunité" htmlFor="opp-name" required>
                  <Input id="opp-name" name="name" required maxLength={160} />
                </FormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Client" htmlFor="opp-customer">
                    <NativeSelect id="opp-customer" name="customerId" defaultValue="">
                      <option value="">Prospect non converti</option>
                      {(customers?.items ?? []).map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Étape" htmlFor="opp-stage">
                    <NativeSelect id="opp-stage" name="stageId" defaultValue={stages[0]?.id ?? ""} required>
                      {stages.map((stage) => (
                        <option key={stage.id} value={stage.id}>
                          {stage.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label={`Montant (${currency})`} htmlFor="opp-amount" required>
                    <Input id="opp-amount" name="amount" inputMode="decimal" required placeholder="1500000" />
                  </FormField>
                  <FormField label="Clôture prévue" htmlFor="opp-date">
                    <Input id="opp-date" name="expectedCloseDate" type="date" />
                  </FormField>
                </div>
                <FormField label="Notes" htmlFor="opp-notes">
                  <Textarea id="opp-notes" name="notes" rows={3} />
                </FormField>
              </FormDialog>
            ) : null}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Prospects actifs" value={leadsToConvert} hint="Hors prospects convertis" icon={<Users />} />
        <StatCard
          label="Pipeline ouvert"
          value={formatMoney(openAmount, currency)}
          hint={`${opportunities.filter((opportunity) => opportunity.status === "open").length} opportunité(s)`}
          icon={<TrendingUp />}
        />
        <StatCard
          label="Étapes du pipeline"
          value={stages.length}
          hint="Configurées pour votre organisation"
          icon={<Target />}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Pipeline commercial</CardTitle>
            <CardDescription>Faites progresser une opportunité en changeant son étape.</CardDescription>
          </div>
          <Badge variant="outline">{formatMoney(openAmount, currency)} en cours</Badge>
        </CardHeader>
        <CardContent>
          {opportunities.length === 0 ? (
            <EmptyState
              icon={<Target />}
              title="Aucune opportunité"
              description="Créez une opportunité pour suivre vos négociations commerciales."
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {stages.map((stage) => {
                const stageOpportunities = opportunities.filter((item) => item.stage_id === stage.id);
                const total = stageOpportunities.reduce(
                  (sum, item) => sum + Number(item.amount_minor),
                  0,
                );
                return (
                  <div key={stage.id} className="rounded-xl border border-border bg-muted/30 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold">{stage.name}</p>
                      <span className="text-xs text-muted-foreground">{stage.probability}%</span>
                    </div>
                    <p className="mb-2 text-xs text-muted-foreground">{formatMoney(total, currency)}</p>
                    <div className="space-y-2">
                      {stageOpportunities.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-border px-2 py-3 text-center text-xs text-muted-foreground">
                          Vide
                        </p>
                      ) : (
                        stageOpportunities.map((opportunity) => (
                          <div key={opportunity.id} className="rounded-lg border border-border bg-card p-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium">{opportunity.name}</p>
                              {canDelete ? (
                                <ConfirmDialog
                                  trigger={
                                    <Button variant="ghost" size="icon" aria-label="Supprimer l'opportunité">
                                      <Trash2 className="size-3.5 text-danger" />
                                    </Button>
                                  }
                                  title="Supprimer cette opportunité ?"
                                  confirmLabel="Supprimer"
                                  action={deleteOpportunityAction}
                                  fields={{ id: opportunity.id }}
                                />
                              ) : null}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {opportunity.customer_name ?? "Client non rattaché"}
                            </p>
                            <p className="mt-1 text-sm font-semibold">
                              {formatMoney(opportunity.amount_minor, opportunity.currency)}
                            </p>
                            {opportunity.expected_close_date ? (
                              <p className="text-[11px] text-muted-foreground">
                                Clôture : {formatDate(opportunity.expected_close_date)}
                              </p>
                            ) : null}
                            {canUpdate && stages.length > 1 ? (
                              <QuickActionForm
                                  action={moveOpportunityAction}
                                  fields={{ id: opportunity.id }}
                                  submitLabel="OK"
                                  successMessage="Étape mise à jour."
                                  className="mt-2"
                                >
                                  <NativeSelect
                                    name="stageId"
                                    defaultValue={opportunity.stage_id}
                                    className="h-8 text-xs"
                                    aria-label="Changer d'étape"
                                  >
                                    {stages.map((option) => (
                                      <option key={option.id} value={option.id}>
                                        {option.name}
                                      </option>
                                    ))}
                                  </NativeSelect>
                                </QuickActionForm>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Prospects</CardTitle>
          <CardDescription>Qualifiez vos prospects puis convertissez-les en clients.</CardDescription>
        </CardHeader>
        {leads.length === 0 ? (
          <CardContent>
            <EmptyState
              icon={<Users />}
              title="Aucun prospect enregistré"
              description="Ajoutez vos premiers prospects pour alimenter le pipeline."
            />
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prospect</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Responsable</TableHead>
                <TableHead>Relance</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell>
                    <p className="font-medium">{lead.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[lead.company, lead.email, lead.phone].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </TableCell>
                  <TableCell className="text-xs">{LEAD_SOURCE_LABELS[lead.source] ?? lead.source}</TableCell>
                  <TableCell className="text-xs">{lead.owner_name ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {lead.next_follow_up_at ? formatDate(lead.next_follow_up_at) : "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={lead.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {canUpdate && lead.status !== "converted" ? (
                        <>
                          {lead.status === "qualified" ? null : (
                            <QuickActionButton
                              action={updateLeadStatusAction}
                              fields={{ id: lead.id, status: "qualified" }}
                              label="Qualifier"
                              variant="ghost"
                              successMessage="Prospect qualifié."
                            />
                          )}
                          <QuickActionButton
                            action={convertLeadAction}
                            fields={{ id: lead.id }}
                            label="Convertir"
                            successMessage="Prospect converti en client."
                          />
                        </>
                      ) : lead.converted_customer_id ? (
                        <Link
                          href={`/app/clients/${lead.converted_customer_id}`}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Voir le client
                        </Link>
                      ) : null}
                      {canDelete ? (
                        <ConfirmDialog
                          trigger={
                            <Button variant="ghost" size="icon" aria-label="Supprimer le prospect">
                              <Trash2 className="size-4 text-danger" />
                            </Button>
                          }
                          title="Supprimer ce prospect ?"
                          description="La suppression est logique : les données restent traçables."
                          confirmLabel="Supprimer"
                          action={deleteLeadAction}
                          fields={{ id: lead.id }}
                        />
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
