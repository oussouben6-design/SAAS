import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { requirePagePermission, can } from "@/lib/server/context";
import { getReports } from "@/modules/reports/service";
import { PERIOD_LABELS, type DashboardPeriod } from "@/modules/dashboard/service";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SimpleBarChart } from "@/modules/dashboard/components/charts";
import { PROJECT_STATUS_LABELS } from "@/modules/projects/service";
import { TASK_STATUS_LABELS } from "@/modules/tasks/service";
import { LEAD_SOURCE_LABELS } from "@/modules/prospection/service";
import { formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Rapports" };

const PERIODS = Object.keys(PERIOD_LABELS) as DashboardPeriod[];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const context = await requirePagePermission("reports", "read");
  const params = await searchParams;
  const period: DashboardPeriod = (PERIODS as string[]).includes(params.period ?? "")
    ? (params.period as DashboardPeriod)
    : "90d";

  const canReadFinance = can(context, "finance", "read");
  const canReadHr = can(context, "hr", "read");

  const data = await getReports(
    { userId: context.user.id, organizationId: context.organization!.id },
    period,
    { canReadFinance, canReadHr },
  );
  const currency = context.organization!.currency;
  const canExport = can(context, "reports", "export");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Rapports"
        description={`Analyse sur la période : ${PERIOD_LABELS[period]}. Toutes les valeurs proviennent des données enregistrées.`}
        actions={
          <>
            <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
              {PERIODS.map((option) => (
                <Link
                  key={option}
                  href={`/app/rapports?period=${option}`}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                    option === period ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {option}
                </Link>
              ))}
            </div>
            {canExport ? (
              <Button variant="outline" asChild>
                <a href={`/app/rapports/export?type=tasks&period=${period}`}>
                  <Download /> Export tâches
                </a>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Projets par statut</CardTitle>
            <CardDescription>Portefeuille complet, hors projets supprimés.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.projectsByStatus.length === 0 ? (
              <EmptyState title="Aucun projet" description="Aucune donnée à analyser sur cette période." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Projets</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.projectsByStatus.map((row) => (
                    <TableRow key={row.status}>
                      <TableCell>{PROJECT_STATUS_LABELS[row.status] ?? row.status}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tâches terminées par mois</CardTitle>
            <CardDescription>Six derniers mois, d&apos;après la date de complétion.</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleBarChart
              data={data.tasksCompletedPerMonth.map((row) => ({ label: row.month, value: row.count }))}
              color="#16a34a"
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Répartition des tâches</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Tâches</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.tasksByStatus.map((row) => (
                  <TableRow key={row.status}>
                    <TableCell>{TASK_STATUS_LABELS[row.status as keyof typeof TASK_STATUS_LABELS] ?? row.status}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Prospection</CardTitle>
            <CardDescription>
              {data.leadConversion.converted} conversion(s) sur {data.leadConversion.total} prospect(s).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.leadsBySource.length === 0 ? (
              <EmptyState title="Aucun prospect" description="Aucune source de prospection enregistrée sur la période." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Prospects</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.leadsBySource.map((row) => (
                    <TableRow key={row.source}>
                      <TableCell>{LEAD_SOURCE_LABELS[row.source] ?? row.source}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Performance de l&apos;équipe</CardTitle>
          <CardDescription>Basée sur les tâches assignées et leurs échéances.</CardDescription>
        </CardHeader>
        {data.teamPerformance.length === 0 ? (
          <CardContent>
            <EmptyState title="Aucune tâche assignée" description="Assignez des tâches pour mesurer la performance." />
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Collaborateur</TableHead>
                <TableHead className="text-right">Terminées</TableHead>
                <TableHead className="text-right">En cours</TableHead>
                <TableHead className="text-right">En retard</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.teamPerformance.map((row) => (
                <TableRow key={row.name}>
                  <TableCell>{row.name}</TableCell>
                  <TableCell className="text-right tabular-nums text-success">{row.done}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.open}</TableCell>
                  <TableCell className="text-right tabular-nums text-danger">{row.overdue}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {data.finance ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Synthèse financière</CardTitle>
              <CardDescription>
                Revenus encaissés, dépenses validées et factures en attente.
              </CardDescription>
            </div>
            {canExport ? (
              <Button variant="outline" size="sm" asChild>
                <a href={`/app/rapports/export?type=finance&period=${period}`}>
                  <Download /> Export finances
                </a>
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs uppercase text-muted-foreground">Revenus</p>
                <p className="text-lg font-semibold text-success">{formatMoney(data.finance.revenueMinor, currency)}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs uppercase text-muted-foreground">Dépenses</p>
                <p className="text-lg font-semibold text-warning">{formatMoney(data.finance.expenseMinor, currency)}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs uppercase text-muted-foreground">Solde enregistré</p>
                <p className="text-lg font-semibold">{formatMoney(data.finance.netMinor, currency)}</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Par catégorie</p>
                {data.finance.byCategory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucune catégorie renseignée.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {data.finance.byCategory.map((row, index) => (
                      <li key={`${row.name}-${index}`} className="flex justify-between gap-2">
                        <span>
                          {row.name} <Badge variant="outline">{row.kind === "income" ? "Revenu" : "Dépense"}</Badge>
                        </span>
                        <span className="tabular-nums">{formatMoney(row.amount, currency)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Factures</p>
                {data.finance.invoicesByStatus.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucune facture enregistrée.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {data.finance.invoicesByStatus.map((row) => (
                      <li key={row.status} className="flex justify-between gap-2">
                        <span>
                          {row.status} ({row.count})
                        </span>
                        <span className="tabular-nums">{formatMoney(row.total, currency)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Synthèse financière</CardTitle>
            <CardDescription>Accès restreint à la permission « finances : lire ».</CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyState
              title="Non disponible pour votre rôle"
              description="Contactez un administrateur pour obtenir l'accès aux données financières."
            />
          </CardContent>
        </Card>
      )}

      {data.hr ? (
        <Card>
          <CardHeader>
            <CardTitle>Ressources humaines</CardTitle>
            <CardDescription>
              {data.hr.employees} employé(s) actif(s) · {data.hr.pendingLeaves} demande(s) de congé en attente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.hr.byDepartment.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun employé enregistré.</p>
            ) : (
              <ul className="grid gap-1 text-sm sm:grid-cols-2">
                {data.hr.byDepartment.map((row) => (
                  <li key={row.name} className="flex justify-between gap-2 rounded-lg border border-border px-3 py-1.5">
                    <span>{row.name}</span>
                    <span className="tabular-nums">{row.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Rappel : le module financier ne constitue pas un logiciel de comptabilité certifié. Les rapports
        reflètent uniquement les écritures saisies dans Excellence 360 CRM (tables tasks, projects, customers, leads,
        revenues, expenses, invoices).
      </p>
    </div>
  );
}
