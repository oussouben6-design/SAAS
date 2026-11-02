import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { requirePagePermission, can } from "@/lib/server/context";
import { getQuote } from "@/modules/finance/service";
import { AppError } from "@/lib/server/errors";
import { EmptyState, PageHeader, StatCard } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormDialog } from "@/components/forms/form-dialog";
import { QuickActionButton } from "@/components/forms/quick-action";
import { StatusBadge } from "@/components/shared/filters";
import { formatDate, formatMoney } from "@/lib/utils";
import { QUOTE_STATUS_LABELS } from "@/lib/validation/finance";
import {
  addQuoteItemAction,
  convertQuoteAction,
  setQuoteStatusAction,
} from "@/modules/finance/actions";

export const metadata: Metadata = { title: "Devis" };

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requirePagePermission("finance", "read");
  const { id } = await params;
  const orgCtx = { userId: context.user.id, organizationId: context.organization!.id };

  let data;
  try {
    data = await getQuote(orgCtx, id);
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") notFound();
    throw error;
  }
  const { quote, items } = data;
  const canUpdate = can(context, "finance", "update");
  const canCreate = can(context, "finance", "create");
  const editable = canUpdate && ["draft", "sent"].includes(quote.status);
  const closed = ["accepted", "rejected", "expired"].includes(quote.status);

  return (
    <div className="space-y-5">
      <Link
        href="/app/finances?vue=devis"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Devis
      </Link>

      <PageHeader
        title={`Devis ${quote.number}`}
        description={`${quote.subject} · ${quote.customer_name ?? "aucun client"} · valable jusqu'au ${formatDate(quote.valid_until)}`}
        badge={
          <StatusBadge
            status={quote.status}
            label={QUOTE_STATUS_LABELS[quote.status as keyof typeof QUOTE_STATUS_LABELS]}
          />
        }
        actions={
          <>
            {canUpdate && quote.status === "draft" ? (
              <QuickActionButton
                action={setQuoteStatusAction}
                fields={{ id: quote.id, status: "sent" }}
                label="Marquer comme envoyé"
              />
            ) : null}
            {canUpdate && ["draft", "sent"].includes(quote.status) ? (
              <>
                <QuickActionButton
                  action={setQuoteStatusAction}
                  fields={{ id: quote.id, status: "accepted" }}
                  label="Accepté"
                  successMessage="Devis marqué comme accepté."
                />
                <QuickActionButton
                  action={setQuoteStatusAction}
                  fields={{ id: quote.id, status: "rejected" }}
                  label="Refusé"
                  variant="ghost"
                  successMessage="Devis marqué comme refusé."
                />
              </>
            ) : null}
            {canCreate && quote.customer_id && !closed ? (
              <QuickActionButton
                action={convertQuoteAction}
                fields={{ id: quote.id }}
                label="Transformer en facture"
                successMessage="Devis transformé en facture brouillon."
              />
            ) : null}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Sous-total" value={formatMoney(quote.subtotal_minor, quote.currency)} />
        <StatCard label="Total" value={formatMoney(quote.total_minor, quote.currency)} />
        <StatCard label="Lignes" value={items.length} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Lignes du devis</CardTitle>
            <CardDescription>
              {closed
                ? "Un devis accepté, refusé ou expiré ne peut plus être modifié."
                : "Ajoutez les prestations avant d'envoyer le devis au client."}
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
              action={addQuoteItemAction}
              submitLabel="Ajouter"
            >
              <input type="hidden" name="quoteId" value={quote.id} />
              <FormField label="Désignation" htmlFor="quote-item-description" required>
                <Input id="quote-item-description" name="description" required maxLength={300} />
              </FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Quantité" htmlFor="quote-item-quantity" required>
                  <Input id="quote-item-quantity" name="quantity" type="number" min="0.01" step="0.01" defaultValue={1} required />
                </FormField>
                <FormField label={`Prix unitaire (${quote.currency})`} htmlFor="quote-item-price" required>
                  <Input id="quote-item-price" name="unitPrice" required />
                </FormField>
              </div>
            </FormDialog>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="p-4">
              <EmptyState icon={<Plus />} title="Aucune ligne" description="Ajoutez au moins une ligne pour chiffrer le devis." />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Désignation</TableHead>
                  <TableHead className="text-right">Quantité</TableHead>
                  <TableHead className="text-right">Prix unitaire</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.description}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(item.quantity)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(item.unit_price_minor, quote.currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(item.amount_minor, quote.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
