import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Download,
  FileSpreadsheet,
  Plus,
  Receipt,
  Wallet,
} from "lucide-react";
import { requirePagePermission, can } from "@/lib/server/context";
import {
  getFinanceSummary,
  listExpenses,
  listFinancialCategories,
  listInvoices,
  listQuotes,
  listRevenues,
} from "@/modules/finance/service";
import { listCustomers } from "@/modules/crm/service";
import { listProjects } from "@/modules/projects/service";
import { listDepartments } from "@/modules/organization/service";
import { PageHeader, EmptyState, StatCard, Alert } from "@/components/ui/misc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormField, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { FormDialog } from "@/components/forms/form-dialog";
import { QuickActionButton } from "@/components/forms/quick-action";
import { FilterBar, Pagination, StatusBadge } from "@/components/shared/filters";
import { formatDate, formatMoney } from "@/lib/utils";
import {
  EXPENSE_STATUS_LABELS,
  INVOICE_STATUS_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  QUOTE_STATUS_LABELS,
} from "@/lib/validation/finance";
import {
  convertQuoteAction,
  createExpenseAction,
  createFinancialCategoryAction,
  createInvoiceAction,
  createQuoteAction,
  createRevenueAction,
  decideExpenseAction,
  deleteExpenseAction,
  deleteRevenueAction,
  setInvoiceStatusAction,
  setQuoteStatusAction,
} from "@/modules/finance/actions";

export const metadata: Metadata = { title: "Finances" };

const VIEWS = [
  { key: "apercu", label: "Aperçu" },
  { key: "factures", label: "Factures" },
  { key: "devis", label: "Devis" },
  { key: "depenses", label: "Dépenses" },
  { key: "recettes", label: "Recettes" },
  { key: "categories", label: "Catégories" },
] as const;

type View = (typeof VIEWS)[number]["key"];

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const context = await requirePagePermission("finance", "read");
  const params = await searchParams;
  const view = (VIEWS.find((item) => item.key === params.vue)?.key ?? "apercu") as View;
  const orgCtx = { userId: context.user.id, organizationId: context.organization!.id };
  const currency = context.organization!.currency;
  const page = params.page ? Number(params.page) : 1;

  const summary = await getFinanceSummary(orgCtx);
  const canCreate = can(context, "finance", "create");
  const canUpdate = can(context, "finance", "update");
  const canValidate = can(context, "finance", "validate");
  const canDelete = can(context, "finance", "delete");
  const canExport = can(context, "finance", "export");

  const [customers, projects, departments, categories] = await Promise.all([
    can(context, "crm", "read") ? listCustomers(orgCtx, { pageSize: 100 }) : Promise.resolve(null),
    can(context, "projects", "read") ? listProjects(orgCtx, { pageSize: 100 }) : Promise.resolve(null),
    listDepartments(orgCtx),
    listFinancialCategories(orgCtx),
  ]);

  const incomeCategories = categories.filter((category) => category.kind === "income");
  const expenseCategories = categories.filter((category) => category.kind === "expense");

  const [invoices, quotes, expenses, revenues] = await Promise.all([
    view === "factures" || view === "apercu"
      ? listInvoices(orgCtx, {
          q: params.q,
          status: params.status,
          page: view === "factures" ? page : 1,
          pageSize: view === "apercu" ? 5 : 20,
        })
      : Promise.resolve(null),
    view === "devis"
      ? listQuotes(orgCtx, { q: params.q, status: params.status, page, pageSize: 20 })
      : Promise.resolve(null),
    view === "depenses" || view === "apercu"
      ? listExpenses(orgCtx, {
          q: params.q,
          status: params.status,
          page: view === "depenses" ? page : 1,
          pageSize: view === "apercu" ? 5 : 20,
        })
      : Promise.resolve(null),
    view === "recettes"
      ? listRevenues(orgCtx, { q: params.q, page, pageSize: 20 })
      : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Finances"
        description="Factures, encaissements, devis, dépenses et recettes de votre organisation."
        badge={<StatusBadge status="sent" label="Suivi de trésorerie" />}
        actions={
          canExport ? (
            <Button variant="outline" asChild>
              <a href="/app/finances/export">
                <Download /> Exporter les factures
              </a>
            </Button>
          ) : null
        }
      />

      <Alert variant="warning" title="Ce module n'est pas une comptabilité certifiée">
        Les montants sont suivis en trésorerie (encaissements et dépenses) pour le pilotage interne.
        Aucun journal comptable, aucune balance, aucune déclaration fiscale ne sont produits. Les
        montants sont stockés en unité mineure entière de la devise de l&apos;organisation ({currency}).
      </Alert>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Facturé (hors annulées)"
          value={formatMoney(summary.invoicedMinor, currency)}
          hint={`${invoices?.total ?? 0} facture(s) correspondante(s)`}
          icon={<Receipt className="size-4" />}
        />
        <StatCard
          label="Encaissé"
          value={formatMoney(summary.paidMinor, currency)}
          tone="success"
          icon={<ArrowUpRight className="size-4" />}
        />
        <StatCard
          label="Reste à encaisser"
          value={formatMoney(summary.outstandingMinor, currency)}
          hint={`${summary.overdueCount} facture(s) en retard · ${summary.draftCount} brouillon(s)`}
          tone={summary.overdueCount > 0 ? "danger" : "warning"}
          icon={<AlertTriangle className="size-4" />}
        />
        <StatCard
          label="Solde simplifié"
          value={formatMoney(summary.balanceMinor, currency)}
          hint={`Recettes ${formatMoney(summary.revenuesMinor, currency)} − dépenses ${formatMoney(summary.expensesMinor, currency)}`}
          icon={<Wallet className="size-4" />}
        />
      </div>

      <nav className="flex flex-wrap gap-1.5" aria-label="Sections finances">
        {VIEWS.map((item) => (
          <Link
            key={item.key}
            href={`/app/finances?vue=${item.key}`}
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

      {view === "apercu" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Dernières factures</CardTitle>
              <CardDescription>Les cinq pièces les plus récentes.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {invoices && invoices.items.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Numéro</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.items.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell>
                          <Link href={`/app/finances/factures/${invoice.id}`} className="font-medium hover:underline">
                            {invoice.number}
                          </Link>
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate">{invoice.customer_name}</TableCell>
                        <TableCell>
                          <StatusBadge
                            status={invoice.status}
                            label={INVOICE_STATUS_LABELS[invoice.status as keyof typeof INVOICE_STATUS_LABELS]}
                          />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(invoice.total_minor, invoice.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-4">
                  <EmptyState
                    icon={<Receipt />}
                    title="Aucune facture"
                    description="Créez une première facture depuis l'onglet Factures."
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dernières dépenses</CardTitle>
              <CardDescription>
                {summary.pendingExpenses} dépense(s) en attente de validation.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {expenses && expenses.items.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Libellé</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.items.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell className="max-w-[220px] truncate">{expense.label}</TableCell>
                        <TableCell>
                          <StatusBadge
                            status={expense.status}
                            label={EXPENSE_STATUS_LABELS[expense.status as keyof typeof EXPENSE_STATUS_LABELS]}
                          />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(expense.amount_minor, expense.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-4">
                  <EmptyState
                    icon={<Wallet />}
                    title="Aucune dépense"
                    description="Les dépenses enregistrées apparaîtront ici."
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {view === "factures" && invoices ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
            <FilterBar action="/app/finances" q={params.q} placeholder="Numéro de facture ou client…" hidden={{ vue: "factures" }}>
              <NativeSelect name="status" defaultValue={params.status ?? ""} className="w-auto min-w-[170px]">
                <option value="">Tous les statuts</option>
                {Object.entries(INVOICE_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </FilterBar>
            {canCreate && customers && customers.items.length > 0 ? (
              <FormDialog
                trigger={
                  <Button>
                    <Plus /> Nouvelle facture
                  </Button>
                }
                title="Créer une facture"
                description="La facture est créée en brouillon avec une première ligne. Ajoutez ensuite d'autres lignes ou enregistrez un encaissement."
                action={createInvoiceAction}
                submitLabel="Créer la facture"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Client" htmlFor="customerId" required>
                    <NativeSelect id="customerId" name="customerId" required defaultValue="">
                      <option value="">Sélectionner…</option>
                      {customers.items.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Projet (facultatif)" htmlFor="projectId">
                    <NativeSelect id="projectId" name="projectId" defaultValue="">
                      <option value="">Aucun</option>
                      {projects?.items.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Date d'émission" htmlFor="issueDate" required>
                    <Input id="issueDate" name="issueDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
                  </FormField>
                  <FormField label="Échéance" htmlFor="dueDate">
                    <Input id="dueDate" name="dueDate" type="date" />
                  </FormField>
                  <FormField label={`TVA (%)`} htmlFor="taxRate" hint="0 si aucune taxe n'est applicable.">
                    <Input id="taxRate" name="taxRate" type="number" min={0} max={100} step="0.01" defaultValue={0} />
                  </FormField>
                  <FormField label="Désignation de la ligne" htmlFor="lineDescription" required>
                    <Input id="lineDescription" name="lineDescription" required maxLength={300} placeholder="Prestation de conseil" />
                  </FormField>
                  <FormField label="Quantité" htmlFor="quantity" required>
                    <Input id="quantity" name="quantity" type="number" min="0.01" step="0.01" defaultValue={1} required />
                  </FormField>
                  <FormField label={`Prix unitaire (${currency})`} htmlFor="unitPrice" required>
                    <Input id="unitPrice" name="unitPrice" required placeholder="250000" />
                  </FormField>
                </div>
                <FormField label="Notes" htmlFor="notes">
                  <Textarea id="notes" name="notes" rows={2} />
                </FormField>
              </FormDialog>
            ) : null}
          </div>

          {invoices.items.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<Receipt />}
                title="Aucune facture"
                description={
                  customers && customers.items.length === 0
                    ? "Créez d'abord un client : toute facture doit être rattachée à un client."
                    : "Créez votre première facture pour suivre vos encaissements."
                }
              />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Numéro</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Émission</TableHead>
                    <TableHead>Échéance</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Encaissé</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.items.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell>
                        <Link href={`/app/finances/factures/${invoice.id}`} className="font-medium hover:underline">
                          {invoice.number}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">{invoice.customer_name}</TableCell>
                      <TableCell>{formatDate(invoice.issue_date)}</TableCell>
                      <TableCell>{formatDate(invoice.due_date)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(invoice.total_minor, invoice.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(invoice.amount_paid_minor, invoice.currency)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={invoice.status}
                          label={INVOICE_STATUS_LABELS[invoice.status as keyof typeof INVOICE_STATUS_LABELS]}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        {canUpdate && invoice.status === "draft" ? (
                          <QuickActionButton
                            action={setInvoiceStatusAction}
                            fields={{ id: invoice.id, status: "sent" }}
                            label="Envoyer"
                            successMessage="Facture marquée comme envoyée."
                          />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination
                page={invoices.page}
                totalPages={invoices.totalPages}
                total={invoices.total}
                basePath="/app/finances"
                params={{ vue: "factures", q: params.q, status: params.status }}
              />
            </>
          )}
        </Card>
      ) : null}

      {view === "devis" && quotes ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
            <FilterBar action="/app/finances" q={params.q} placeholder="Numéro ou objet du devis…" hidden={{ vue: "devis" }}>
              <NativeSelect name="status" defaultValue={params.status ?? ""} className="w-auto min-w-[170px]">
                <option value="">Tous les statuts</option>
                {Object.entries(QUOTE_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </FilterBar>
            {canCreate ? (
              <FormDialog
                trigger={
                  <Button>
                    <Plus /> Nouveau devis
                  </Button>
                }
                title="Créer un devis"
                description="Un devis peut être transformé en facture depuis sa fiche."
                action={createQuoteAction}
                submitLabel="Créer le devis"
              >
                <FormField label="Objet" htmlFor="subject" required>
                  <Input id="subject" name="subject" required maxLength={200} placeholder="Refonte du site institutionnel" />
                </FormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Client (facultatif)" htmlFor="quote-customer">
                    <NativeSelect id="quote-customer" name="customerId" defaultValue="">
                      <option value="">Aucun</option>
                      {customers?.items.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Date d'émission" htmlFor="quote-issue" required>
                    <Input id="quote-issue" name="issueDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
                  </FormField>
                  <FormField label="Valable jusqu'au" htmlFor="validUntil">
                    <Input id="validUntil" name="validUntil" type="date" />
                  </FormField>
                  <FormField label="TVA (%)" htmlFor="quote-tax">
                    <Input id="quote-tax" name="taxRate" type="number" min={0} max={100} step="0.01" defaultValue={0} />
                  </FormField>
                  <FormField label="Désignation" htmlFor="quote-line" required>
                    <Input id="quote-line" name="lineDescription" required maxLength={300} />
                  </FormField>
                  <FormField label="Quantité" htmlFor="quote-qty" required>
                    <Input id="quote-qty" name="quantity" type="number" min="0.01" step="0.01" defaultValue={1} required />
                  </FormField>
                  <FormField label={`Prix unitaire (${currency})`} htmlFor="quote-price" required>
                    <Input id="quote-price" name="unitPrice" required />
                  </FormField>
                </div>
              </FormDialog>
            ) : null}
          </div>

          {quotes.items.length === 0 ? (
            <div className="p-4">
              <EmptyState icon={<FileSpreadsheet />} title="Aucun devis" description="Créez un devis pour préparer une proposition chiffrée." />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Numéro</TableHead>
                    <TableHead>Objet</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Validité</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotes.items.map((quote) => (
                    <TableRow key={quote.id}>
                      <TableCell>
                        <Link href={`/app/finances/devis/${quote.id}`} className="font-medium hover:underline">
                          {quote.number}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate">{quote.subject}</TableCell>
                      <TableCell className="max-w-[160px] truncate">{quote.customer_name ?? "—"}</TableCell>
                      <TableCell>{formatDate(quote.valid_until)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(quote.total_minor, quote.currency)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={quote.status}
                          label={QUOTE_STATUS_LABELS[quote.status as keyof typeof QUOTE_STATUS_LABELS]}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {canUpdate && quote.status === "draft" ? (
                            <QuickActionButton
                              action={setQuoteStatusAction}
                              fields={{ id: quote.id, status: "sent" }}
                              label="Envoyer"
                            />
                          ) : null}
                          {canCreate && quote.customer_id && quote.status !== "rejected" ? (
                            <QuickActionButton
                              action={convertQuoteAction}
                              fields={{ id: quote.id }}
                              label="Facturer"
                              successMessage="Devis transformé en facture brouillon."
                            />
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination
                page={quotes.page}
                totalPages={quotes.totalPages}
                total={quotes.total}
                basePath="/app/finances"
                params={{ vue: "devis", q: params.q, status: params.status }}
              />
            </>
          )}
        </Card>
      ) : null}

      {view === "depenses" && expenses ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
            <FilterBar action="/app/finances" q={params.q} placeholder="Libellé ou fournisseur…" hidden={{ vue: "depenses" }}>
              <NativeSelect name="status" defaultValue={params.status ?? ""} className="w-auto min-w-[170px]">
                <option value="">Tous les statuts</option>
                {Object.entries(EXPENSE_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </FilterBar>
            {canCreate ? (
              <FormDialog
                trigger={
                  <Button>
                    <Plus /> Nouvelle dépense
                  </Button>
                }
                title="Enregistrer une dépense"
                description="La dépense est créée « en attente » : sa validation exige une autre personne disposant de la permission « valider »."
                action={createExpenseAction}
                submitLabel="Enregistrer la dépense"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Libellé" htmlFor="expense-label" required>
                    <Input id="expense-label" name="label" required maxLength={200} placeholder="Fournitures de bureau" />
                  </FormField>
                  <FormField label={`Montant (${currency})`} htmlFor="expense-amount" required>
                    <Input id="expense-amount" name="amount" required placeholder="125000" />
                  </FormField>
                  <FormField label="Date" htmlFor="expense-date" required>
                    <Input id="expense-date" name="expenseDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
                  </FormField>
                  <FormField label="Catégorie" htmlFor="expense-category">
                    <NativeSelect id="expense-category" name="categoryId" defaultValue="">
                      <option value="">Aucune</option>
                      {expenseCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Projet" htmlFor="expense-project">
                    <NativeSelect id="expense-project" name="projectId" defaultValue="">
                      <option value="">Aucun</option>
                      {projects?.items.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Département" htmlFor="expense-department">
                    <NativeSelect id="expense-department" name="departmentId" defaultValue="">
                      <option value="">Aucun</option>
                      {departments.map((department) => (
                        <option key={department.id} value={department.id}>
                          {department.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Fournisseur" htmlFor="expense-supplier">
                    <Input id="expense-supplier" name="supplier" maxLength={160} />
                  </FormField>
                  <FormField label="Moyen de paiement" htmlFor="expense-method">
                    <NativeSelect id="expense-method" name="method" defaultValue="transfer">
                      {PAYMENT_METHODS.map((method) => (
                        <option key={method} value={method}>
                          {PAYMENT_METHOD_LABELS[method]}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Référence" htmlFor="expense-reference">
                    <Input id="expense-reference" name="reference" maxLength={120} />
                  </FormField>
                </div>
                <FormField label="Notes" htmlFor="expense-notes">
                  <Textarea id="expense-notes" name="notes" rows={2} />
                </FormField>
              </FormDialog>
            ) : null}
          </div>

          {expenses.items.length === 0 ? (
            <div className="p-4">
              <EmptyState icon={<Wallet />} title="Aucune dépense" description="Les dépenses apparaîtront ici avec leur statut de validation." />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Libellé</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Catégorie</TableHead>
                    <TableHead>Projet</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.items.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell className="font-medium">{expense.label}</TableCell>
                      <TableCell>{formatDate(expense.expense_date)}</TableCell>
                      <TableCell>{expense.category_name ?? "—"}</TableCell>
                      <TableCell className="max-w-[160px] truncate">{expense.project_name ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(expense.amount_minor, expense.currency)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={expense.status}
                          label={EXPENSE_STATUS_LABELS[expense.status as keyof typeof EXPENSE_STATUS_LABELS]}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {canValidate && expense.status === "pending" ? (
                            <>
                              <QuickActionButton
                                action={decideExpenseAction}
                                fields={{ id: expense.id, decision: "approved" }}
                                label="Valider"
                                successMessage="Dépense validée."
                              />
                              <QuickActionButton
                                action={decideExpenseAction}
                                fields={{ id: expense.id, decision: "rejected" }}
                                label="Refuser"
                                variant="destructive"
                                successMessage="Dépense refusée."
                              />
                            </>
                          ) : null}
                          {canDelete && expense.status !== "approved" ? (
                            <QuickActionButton
                              action={deleteExpenseAction}
                              fields={{ id: expense.id }}
                              label="Supprimer"
                              variant="ghost"
                              successMessage="Dépense supprimée."
                            />
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination
                page={expenses.page}
                totalPages={expenses.totalPages}
                total={expenses.total}
                basePath="/app/finances"
                params={{ vue: "depenses", q: params.q, status: params.status }}
              />
            </>
          )}
        </Card>
      ) : null}

      {view === "recettes" && revenues ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
            <FilterBar action="/app/finances" q={params.q} placeholder="Libellé de la recette…" hidden={{ vue: "recettes" }} />
            {canCreate ? (
              <FormDialog
                trigger={
                  <Button>
                    <Plus /> Nouvelle recette
                  </Button>
                }
                title="Enregistrer une recette"
                description="Les encaissements de factures créent automatiquement une recette ; utilisez ce formulaire pour les autres entrées."
                action={createRevenueAction}
                submitLabel="Enregistrer la recette"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Libellé" htmlFor="revenue-label" required>
                    <Input id="revenue-label" name="label" required maxLength={200} placeholder="Subvention annuelle" />
                  </FormField>
                  <FormField label={`Montant (${currency})`} htmlFor="revenue-amount" required>
                    <Input id="revenue-amount" name="amount" required />
                  </FormField>
                  <FormField label="Date" htmlFor="revenue-date" required>
                    <Input id="revenue-date" name="receivedAt" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
                  </FormField>
                  <FormField label="Catégorie" htmlFor="revenue-category">
                    <NativeSelect id="revenue-category" name="categoryId" defaultValue="">
                      <option value="">Aucune</option>
                      {incomeCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Moyen de paiement" htmlFor="revenue-method">
                    <NativeSelect id="revenue-method" name="method" defaultValue="transfer">
                      {PAYMENT_METHODS.map((method) => (
                        <option key={method} value={method}>
                          {PAYMENT_METHOD_LABELS[method]}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Référence" htmlFor="revenue-reference">
                    <Input id="revenue-reference" name="reference" maxLength={120} />
                  </FormField>
                </div>
                <FormField label="Notes" htmlFor="revenue-notes">
                  <Textarea id="revenue-notes" name="notes" rows={2} />
                </FormField>
              </FormDialog>
            ) : null}
          </div>

          {revenues.items.length === 0 ? (
            <div className="p-4">
              <EmptyState icon={<ArrowDownRight />} title="Aucune recette" description="Les recettes encaissées apparaîtront ici." />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Libellé</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Catégorie</TableHead>
                    <TableHead>Origine</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {revenues.items.map((revenue) => (
                    <TableRow key={revenue.id}>
                      <TableCell className="font-medium">{revenue.label}</TableCell>
                      <TableCell>{formatDate(revenue.received_at)}</TableCell>
                      <TableCell>{revenue.category_name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {revenue.invoice_id ? "Encaissement facture" : "Saisie manuelle"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(revenue.amount_minor, revenue.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        {canDelete && !revenue.invoice_id ? (
                          <QuickActionButton
                            action={deleteRevenueAction}
                            fields={{ id: revenue.id }}
                            label="Supprimer"
                            variant="ghost"
                          />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination
                page={revenues.page}
                totalPages={revenues.totalPages}
                total={revenues.total}
                basePath="/app/finances"
                params={{ vue: "recettes", q: params.q }}
              />
            </>
          )}
        </Card>
      ) : null}

      {view === "categories" ? (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Catégories financières</CardTitle>
              <CardDescription>Utilisées pour classer recettes et dépenses. Configurables par organisation.</CardDescription>
            </div>
            {canUpdate ? (
              <FormDialog
                trigger={
                  <Button variant="outline">
                    <Plus /> Catégorie
                  </Button>
                }
                title="Nouvelle catégorie financière"
                action={createFinancialCategoryAction}
                submitLabel="Créer"
              >
                <FormField label="Type" htmlFor="category-kind" required>
                  <NativeSelect id="category-kind" name="kind" defaultValue="expense">
                    <option value="expense">Dépense</option>
                    <option value="income">Recette</option>
                  </NativeSelect>
                </FormField>
                <FormField label="Nom" htmlFor="category-name" required>
                  <Input id="category-name" name="name" required maxLength={80} placeholder="Fournitures" />
                </FormField>
              </FormDialog>
            ) : null}
          </CardHeader>
          <CardContent className="p-0">
            {categories.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={<FileSpreadsheet />}
                  title="Aucune catégorie"
                  description="Les catégories par défaut sont créées à l'onboarding ; ajoutez-en si nécessaire."
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Écritures</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((category) => (
                    <TableRow key={category.id}>
                      <TableCell className="font-medium">{category.name}</TableCell>
                      <TableCell>{category.kind === "income" ? "Recette" : "Dépense"}</TableCell>
                      <TableCell className="text-right tabular-nums">{category.entries_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      {view === "factures" && canDelete ? (
        <Alert variant="info" title="Suppression">
          Une facture sans encaissement peut être supprimée depuis sa fiche. Une facture comportant
          des encaissements doit d&apos;abord être annulée : l&apos;historique financier est conservé.
        </Alert>
      ) : null}
    </div>
  );
}
