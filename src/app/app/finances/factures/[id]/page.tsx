import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CreditCard, Plus, Trash2 } from "lucide-react";
import { requirePagePermission, can } from "@/lib/server/context";
import { getInvoice } from "@/modules/finance/service";
import { listCustomers } from "@/modules/crm/service";
import { AppError } from "@/lib/server/errors";
import { Alert, EmptyState, PageHeader, StatCard } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormDialog } from "@/components/forms/form-dialog";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { QuickActionButton } from "@/components/forms/quick-action";
import { StatusBadge } from "@/components/shared/filters";
import { formatDate, formatMoney } from "@/lib/utils";
import {
  INVOICE_STATUS_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
} from "@/lib/validation/finance";
import {
  addInvoiceItemAction,
  deleteInvoiceAction,
  deleteInvoiceItemAction,
  recordPaymentAction,
  setInvoiceStatusAction,
  updateInvoiceAction,
} from "@/modules/finance/actions";

export const metadata: Metadata = { title: "Facture" };

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requirePagePermission("finance", "read");
  const { id } = await params;
  const orgCtx = { userId: context.user.id, organizationId: context.organization!.id };

  let data;
  try {
    data = await getInvoice(orgCtx, id);
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") notFound();
    throw error;
  }

  const { invoice, items, payments, customer } = data;
  const currency = invoice.currency;
  const canUpdate = can(context, "finance", "update");
  const canValidate = can(context, "finance", "validate");
  const canDelete = can(context, "finance", "delete");
  const editable = canUpdate && !["paid", "cancelled"].includes(invoice.status);
  const remaining = Number(invoice.total_minor) - Number(invoice.amount_paid_minor);
  const customers = editable
    ? await listCustomers(orgCtx, { pageSize: 100 }).catch(() => null)
    : null;

  return (
    <div className="space-y-5">
      <Link
        href="/app/finances?vue=factures"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Factures
      </Link>

      <PageHeader
        title={`Facture ${invoice.number}`}
        description={`Client : ${customer.name} · émise le ${formatDate(invoice.issue_date)} · échéance ${formatDate(invoice.due_date)}`}
        badge={
          <StatusBadge
            status={invoice.status}
            label={INVOICE_STATUS_LABELS[invoice.status as keyof typeof INVOICE_STATUS_LABELS]}
          />
        }
        actions={
          <>
            {canUpdate && invoice.status === "draft" ? (
              <QuickActionButton
                action={setInvoiceStatusAction}
                fields={{ id: invoice.id, status: "sent" }}
                label="Marquer comme envoyée"
                successMessage="Facture marquée comme envoyée."
              />
            ) : null}
            {canUpdate && ["sent", "partial", "overdue"].includes(invoice.status) ? (
              <QuickActionButton
                action={setInvoiceStatusAction}
                fields={{ id: invoice.id, status: "overdue" }}
                label="Marquer en retard"
                variant="outline"
              />
            ) : null}
            {canDelete && Number(invoice.amount_paid_minor) === 0 ? (
              <ConfirmDialog
                trigger={
                  <Button variant="ghost" size="sm">
                    <Trash2 /> Supprimer
                  </Button>
                }
                title="Supprimer cette facture ?"
                description="La facture sera retirée des listes (suppression logique) et l'opération sera journalisée."
                confirmLabel="Supprimer la facture"
                action={deleteInvoiceAction}
                fields={{ id: invoice.id }}
              />
            ) : null}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sous-total" value={formatMoney(invoice.subtotal_minor, currency)} />
        <StatCard label="Taxe" value={formatMoney(invoice.tax_minor, currency)} hint="Taux appliqué sur le sous-total" />
        <StatCard label="Total" value={formatMoney(invoice.total_minor, currency)} />
        <StatCard
          label="Reste à encaisser"
          value={formatMoney(String(Math.max(0, remaining)), currency)}
          hint={`Encaissé : ${formatMoney(invoice.amount_paid_minor, currency)}`}
          tone={remaining > 0 ? "warning" : "success"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Lignes de facturation</CardTitle>
              <CardDescription>
                {items.length} ligne(s). Toute modification recalcule le sous-total, la taxe et le total.
              </CardDescription>
            </div>
            {editable ? (
              <FormDialog
                trigger={
                  <Button variant="outline" size="sm">
                    <Plus /> Ligne
                  </Button>
                }
                title="Ajouter une ligne"
                action={addInvoiceItemAction}
                submitLabel="Ajouter"
              >
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <FormField label="Désignation" htmlFor="item-description" required>
                  <Input id="item-description" name="description" required maxLength={300} />
                </FormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Quantité" htmlFor="item-quantity" required>
                    <Input id="item-quantity" name="quantity" type="number" min="0.01" step="0.01" defaultValue={1} required />
                  </FormField>
                  <FormField label={`Prix unitaire (${currency})`} htmlFor="item-price" required>
                    <Input id="item-price" name="unitPrice" required />
                  </FormField>
                </div>
              </FormDialog>
            ) : null}
          </CardHeader>
          <CardContent className="p-0">
            {items.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={<Plus />}
                  title="Aucune ligne"
                  description="Ajoutez au moins une ligne avant d'envoyer la facture."
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Désignation</TableHead>
                    <TableHead className="text-right">Quantité</TableHead>
                    <TableHead className="text-right">Prix unitaire</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="max-w-[280px]">{item.description}</TableCell>
                      <TableCell className="text-right tabular-nums">{Number(item.quantity)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(item.unit_price_minor, currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(item.amount_minor, currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        {editable ? (
                          <QuickActionButton
                            action={deleteInvoiceItemAction}
                            fields={{ invoiceId: invoice.id, itemId: item.id }}
                            label="Retirer"
                            variant="ghost"
                            successMessage="Ligne supprimée."
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

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Encaissements</CardTitle>
              <CardDescription>
                Chaque encaissement crée une recette de trésorerie liée à cette facture.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {canValidate && remaining > 0 && invoice.status !== "cancelled" ? (
                <FormDialog
                  trigger={
                    <Button className="w-full">
                      <CreditCard /> Enregistrer un encaissement
                    </Button>
                  }
                  title="Encaissement"
                  description={`Solde restant : ${formatMoney(String(remaining), currency)}`}
                  action={recordPaymentAction}
                  submitLabel="Enregistrer"
                >
                  <input type="hidden" name="invoiceId" value={invoice.id} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label={`Montant (${currency})`} htmlFor="payment-amount" required>
                      <Input id="payment-amount" name="amount" required defaultValue={String(remaining)} />
                    </FormField>
                    <FormField label="Date" htmlFor="payment-date" required>
                      <Input id="payment-date" name="paidAt" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
                    </FormField>
                    <FormField label="Moyen" htmlFor="payment-method">
                      <NativeSelect id="payment-method" name="method" defaultValue="transfer">
                        {PAYMENT_METHODS.map((method) => (
                          <option key={method} value={method}>
                            {PAYMENT_METHOD_LABELS[method]}
                          </option>
                        ))}
                      </NativeSelect>
                    </FormField>
                    <FormField label="Référence" htmlFor="payment-reference">
                      <Input id="payment-reference" name="reference" maxLength={120} />
                    </FormField>
                  </div>
                  <FormField label="Note" htmlFor="payment-notes">
                    <Textarea id="payment-notes" name="notes" rows={2} />
                  </FormField>
                </FormDialog>
              ) : null}

              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun encaissement enregistré.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {payments.map((payment) => (
                    <li key={payment.id} className="flex items-start justify-between gap-2 border-b border-border pb-2 last:border-0">
                      <div>
                        <p className="font-medium tabular-nums">
                          {formatMoney(payment.amount_minor, currency)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(payment.paid_at)} ·{" "}
                          {PAYMENT_METHOD_LABELS[payment.method as keyof typeof PAYMENT_METHOD_LABELS] ?? payment.method}
                          {payment.reference ? ` · ${payment.reference}` : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {editable && customers ? (
            <Card>
              <CardHeader>
                <CardTitle>Paramètres de la facture</CardTitle>
                <CardDescription>Client, dates et taux de taxe.</CardDescription>
              </CardHeader>
              <CardContent>
                <FormDialog
                  trigger={
                    <Button variant="outline" className="w-full">
                      Modifier
                    </Button>
                  }
                  title="Modifier la facture"
                  action={updateInvoiceAction}
                  submitLabel="Enregistrer"
                >
                  <input type="hidden" name="id" value={invoice.id} />
                  <FormField label="Client" htmlFor="edit-customer" required>
                    <NativeSelect id="edit-customer" name="customerId" required defaultValue={invoice.customer_id}>
                      {customers.items.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="Date d'émission" htmlFor="edit-issue" required>
                      <Input id="edit-issue" name="issueDate" type="date" required defaultValue={invoice.issue_date.slice(0, 10)} />
                    </FormField>
                    <FormField label="Échéance" htmlFor="edit-due">
                      <Input id="edit-due" name="dueDate" type="date" defaultValue={invoice.due_date?.slice(0, 10) ?? ""} />
                    </FormField>
                    <FormField label="TVA (%)" htmlFor="edit-tax">
                      <Input
                        id="edit-tax"
                        name="taxRate"
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        defaultValue={Math.round((Number(invoice.tax_minor) / Math.max(1, Number(invoice.subtotal_minor))) * 10000) / 100}
                      />
                    </FormField>
                  </div>
                  <FormField label="Notes" htmlFor="edit-notes">
                    <Textarea id="edit-notes" name="notes" rows={2} defaultValue={invoice.notes ?? ""} />
                  </FormField>
                </FormDialog>
              </CardContent>
            </Card>
          ) : (
            <Alert variant="info" title="Facture figée">
              Une facture payée ou annulée ne peut plus être modifiée. Créez un avoir ou une nouvelle
              facture si nécessaire (les avoirs ne sont pas encore développés).
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}
