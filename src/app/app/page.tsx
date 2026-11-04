import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  FolderKanban,
  ListTodo,
  Receipt,
  Target,
  Users,
  Wallet,
} from "lucide-react";
import { requireContext, can } from "@/lib/server/context";
import { getDashboard, PERIOD_LABELS, type DashboardPeriod } from "@/modules/dashboard/service";
import { PageHeader, StatCard, EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FinanceChart, TaskStatusChart } from "@/modules/dashboard/components/charts";
import { formatDate, formatMoney, relativeTime } from "@/lib/utils";
import { TASK_STATUS_LABELS } from "@/modules/tasks/service";

export const metadata: Metadata = { title: "Tableau de bord" };

const PERIODS = Object.keys(PERIOD_LABELS) as DashboardPeriod[];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const context = await requireContext();
  const { period: rawPeriod } = await searchParams;
  const period: DashboardPeriod = (PERIODS as string[]).includes(rawPeriod ?? "")
    ? (rawPeriod as DashboardPeriod)
    : "30d";

  const data = await getDashboard(
    { userId: context.user.id, organizationId: context.organization!.id },
    period,
    {
      canReadFinance: can(context, "finance", "read"),
      canReadAudit: can(context, "audit", "read"),
    },
  );

  const currency = context.organization!.currency;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Bonjour ${context.user.fullName.split(" ")[0]}`}
        description={`Vue consolidée de ${context.organization!.name} · ${PERIOD_LABELS[period]}`}
        badge={<Badge variant="primary">{context.member?.roleKeys[0] === "owner" ? "Administrateur principal" : "Espace de travail"}</Badge>}
        actions={
          <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
            {PERIODS.map((option) => (
              <Link
                key={option}
                href={`/app?period=${option}`}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  option === period ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {option === "all" ? "Tout" : option === "12m" ? "12 mois" : option.replace("d", " j")}
              </Link>
            ))}
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Projets"
          value={data.projects.total}
          hint={`${data.projects.active} en cours · ${data.projects.completed} terminés`}
          icon={<FolderKanban />}
        />
        <StatCard
          label="Tâches en retard"
          value={data.tasks.overdue}
          tone={data.tasks.overdue > 0 ? "danger" : "success"}
          hint={`${data.tasks.done} terminées sur ${data.tasks.total}`}
          icon={<AlertTriangle />}
        />
        <StatCard
          label="Clients"
          value={data.customers.total}
          hint={`${data.customers.newInPeriod} nouveaux sur la période`}
          icon={<Users />}
        />
        <StatCard
          label="Prospects"
          value={data.leads.total}
          hint={`${data.leads.newInPeriod} nouveaux sur la période`}
          icon={<Target />}
        />
      </div>

      {data.finance.canRead ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Revenus enregistrés"
            value={formatMoney(data.finance.revenueMinor, currency)}
            hint={PERIOD_LABELS[period]}
            tone="success"
            icon={<Wallet />}
          />
          <StatCard
            label="Dépenses enregistrées"
            value={formatMoney(data.finance.expenseMinor, currency)}
            hint={PERIOD_LABELS[period]}
            tone="warning"
            icon={<Receipt />}
          />
          <StatCard
            label="Factures impayées"
            value={formatMoney(data.finance.unpaidMinor, currency)}
            hint={`${data.finance.unpaidCount} facture(s) en attente`}
            tone={data.finance.unpaidCount > 0 ? "danger" : "default"}
            icon={<Receipt />}
          />
          <StatCard
            label="Opportunités ouvertes"
            value={formatMoney(data.opportunities.amountMinor, currency)}
            hint={`${data.opportunities.open} opportunité(s) · ${data.opportunities.wonInPeriod} gagnée(s)`}
            icon={<Target />}
          />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Trésorerie enregistrée</CardTitle>
              <CardDescription>
                Revenus et dépenses saisis sur les 6 derniers mois — données réelles de la base.
              </CardDescription>
            </div>
            {!data.finance.canRead ? <Badge>Accès finances restreint</Badge> : null}
          </CardHeader>
          <CardContent>
            {data.finance.canRead ? (
              <FinanceChart data={data.monthlyFinance} currency={currency} />
            ) : (
              <EmptyState
                icon={<Wallet />}
                title="Module finances non accessible"
                description="Votre rôle ne dispose pas de la permission « finances : lire ». Demandez une élévation de droits à un administrateur."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Répartition des tâches</CardTitle>
            <CardDescription>Ensemble des tâches non supprimées.</CardDescription>
          </CardHeader>
          <CardContent>
            <TaskStatusChart data={data.tasksByStatus} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Échéances à venir</CardTitle>
              <CardDescription>Tâches, jalons et événements des 30 prochains jours.</CardDescription>
            </div>
            <CalendarClock className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-2">
            {data.upcoming.length === 0 ? (
              <EmptyState
                title="Aucune échéance"
                description="Créez des tâches avec une date d'échéance pour les voir apparaître ici."
              />
            ) : (
              data.upcoming.map((item) => (
                <div
                  key={`${item.kind}-${item.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.kind === "task"
                        ? TASK_STATUS_LABELS[item.status as keyof typeof TASK_STATUS_LABELS] ?? "Tâche"
                        : item.kind === "milestone"
                          ? "Jalon de projet"
                          : "Événement"}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-muted-foreground">
                    {formatDate(item.dueDate)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Charge de l&apos;équipe</CardTitle>
              <CardDescription>Tâches ouvertes et en retard par collaborateur.</CardDescription>
            </div>
            <ListTodo className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-2">
            {data.workload.length === 0 ? (
              <EmptyState title="Aucune tâche assignée" description="Assignez des tâches pour suivre la charge." />
            ) : (
              data.workload.map((member) => (
                <div key={member.name} className="flex items-center gap-3">
                  <span className="w-40 truncate text-sm">{member.name}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${Math.min(100, (member.open / Math.max(...data.workload.map((entry) => entry.open))) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="w-20 text-right text-xs text-muted-foreground">
                    {member.open} ouvertes
                  </span>
                  {member.overdue > 0 ? (
                    <Badge variant="danger">{member.overdue} en retard</Badge>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Activités récentes</CardTitle>
            <CardDescription>
              {data.finance.canRead
                ? "Journal des opérations enregistrées dans l'organisation."
                : "Journal des opérations — accès limité aux administrateurs."}
            </CardDescription>
          </div>
          {can(context, "audit", "read") ? (
            <Link href="/app/journal" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              Journal complet <ArrowUpRight className="size-3" />
            </Link>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-1.5">
          {data.recentActivity.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aucune activité enregistrée pour le moment.
            </p>
          ) : (
            data.recentActivity.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 rounded-lg px-1 py-1.5">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{entry.summary}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.actor ?? "Système"} · {relativeTime(entry.createdAt)}
                  </p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
