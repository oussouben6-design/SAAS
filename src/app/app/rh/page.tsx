import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Download, Plus, UserRound, Users } from "lucide-react";
import { requirePagePermission, can } from "@/lib/server/context";
import {
  getHrSummary,
  listEmployeeOptions,
  listEmployees,
  listLeaveRequests,
} from "@/modules/hr/service";
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
  CONTRACT_TYPES,
  CONTRACT_TYPE_LABELS,
  EMPLOYEE_STATUSES,
  EMPLOYEE_STATUS_LABELS,
  LEAVE_STATUS_LABELS,
  LEAVE_TYPES,
  LEAVE_TYPE_LABELS,
} from "@/lib/validation/hr";
import {
  createEmployeeAction,
  createLeaveRequestAction,
  decideLeaveRequestAction,
  recordAttendanceAction,
} from "@/modules/hr/actions";

export const metadata: Metadata = { title: "Ressources humaines" };

const VIEWS = [
  { key: "employes", label: "Employés" },
  { key: "conges", label: "Congés" },
  { key: "presences", label: "Présences" },
] as const;

type View = (typeof VIEWS)[number]["key"];

export default async function HrPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const context = await requirePagePermission("hr", "read");
  const params = await searchParams;
  const view = (VIEWS.find((item) => item.key === params.vue)?.key ?? "employes") as View;
  const orgCtx = { userId: context.user.id, organizationId: context.organization!.id };
  const page = params.page ? Number(params.page) : 1;

  const [summary, departments, employeeOptions] = await Promise.all([
    getHrSummary(orgCtx),
    listDepartments(orgCtx),
    listEmployeeOptions(orgCtx),
  ]);

  const canCreate = can(context, "hr", "create");
  const canUpdate = can(context, "hr", "update");
  const canValidate = can(context, "hr", "validate");
  const canExport = can(context, "hr", "export");

  const employees =
    view === "employes"
      ? await listEmployees(orgCtx, {
          q: params.q,
          status: params.status,
          departmentId: params.department,
          page,
          pageSize: 20,
        })
      : null;

  const leaves =
    view === "conges"
      ? await listLeaveRequests(orgCtx, { status: params.status, page, pageSize: 20 })
      : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ressources humaines"
        description="Dossiers employés, contrats, congés et présences de votre organisation."
        actions={
          canExport ? (
            <Button variant="outline" asChild>
              {/* Téléchargement CSV : lien direct, pas de navigation client. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/app/rh/export">
                <Download /> Exporter les employés
              </a>
            </Button>
          ) : null
        }
      />

      <Alert variant="info" title="Périmètre du module">
        Ce module gère les dossiers administratifs, les contrats et les congés. Il ne calcule aucune
        paie, ne produit aucun bulletin de salaire et ne réalise aucune déclaration sociale.
      </Alert>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Effectif" value={summary.headcount} icon={<Users className="size-4" />} />
        <StatCard label="Actifs" value={summary.active} tone="success" />
        <StatCard label="En congé" value={summary.onLeave} tone="warning" />
        <StatCard
          label="Salaires de référence"
          value={formatMoney(summary.payrollMinor, summary.currency)}
          hint={`${summary.pendingLeave} demande(s) de congé en attente · montant indicatif, hors charges`}
        />
      </div>

      <nav className="flex flex-wrap gap-1.5" aria-label="Sections RH">
        {VIEWS.map((item) => (
          <Link
            key={item.key}
            href={`/app/rh?vue=${item.key}`}
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

      {view === "employes" && employees ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
            <FilterBar
              action="/app/rh"
              q={params.q}
              placeholder="Nom, e-mail ou poste…"
              hidden={{ vue: "employes" }}
            >
              <NativeSelect name="status" defaultValue={params.status ?? ""} className="w-auto min-w-[150px]">
                <option value="">Tous les statuts</option>
                {EMPLOYEE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {EMPLOYEE_STATUS_LABELS[status]}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect name="department" defaultValue={params.department ?? ""} className="w-auto min-w-[160px]">
                <option value="">Tous les départements</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </NativeSelect>
            </FilterBar>

            {canCreate ? (
              <FormDialog
                trigger={
                  <Button>
                    <Plus /> Nouvel employé
                  </Button>
                }
                title="Créer un dossier employé"
                description="Les champs marqués d'un astérisque sont obligatoires. Le salaire de référence est facultatif."
                action={createEmployeeAction}
                submitLabel="Créer le dossier"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Prénom" htmlFor="firstName" required>
                    <Input id="firstName" name="firstName" required maxLength={80} />
                  </FormField>
                  <FormField label="Nom" htmlFor="lastName" required>
                    <Input id="lastName" name="lastName" required maxLength={80} />
                  </FormField>
                  <FormField label="E-mail" htmlFor="email">
                    <Input id="email" name="email" type="email" />
                  </FormField>
                  <FormField label="Téléphone" htmlFor="phone">
                    <Input id="phone" name="phone" maxLength={40} />
                  </FormField>
                  <FormField label="Poste" htmlFor="jobTitle">
                    <Input id="jobTitle" name="jobTitle" maxLength={120} />
                  </FormField>
                  <FormField label="Département" htmlFor="departmentId">
                    <NativeSelect id="departmentId" name="departmentId" defaultValue="">
                      <option value="">Aucun</option>
                      {departments.map((department) => (
                        <option key={department.id} value={department.id}>
                          {department.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Type de contrat" htmlFor="contractType">
                    <NativeSelect id="contractType" name="contractType" defaultValue="cdi">
                      {CONTRACT_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {CONTRACT_TYPE_LABELS[type]}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Statut" htmlFor="status">
                    <NativeSelect id="status" name="status" defaultValue="active">
                      {EMPLOYEE_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {EMPLOYEE_STATUS_LABELS[status]}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Date d'embauche" htmlFor="hireDate">
                    <Input id="hireDate" name="hireDate" type="date" />
                  </FormField>
                  <FormField label="Date de fin (CDD)" htmlFor="endDate">
                    <Input id="endDate" name="endDate" type="date" />
                  </FormField>
                  <FormField label={`Salaire de référence (${summary.currency})`} htmlFor="baseSalary" hint="Facultatif, visible uniquement avec la permission RH.">
                    <Input id="baseSalary" name="baseSalary" placeholder="450000" />
                  </FormField>
                  <FormField label="Responsable" htmlFor="managerId">
                    <NativeSelect id="managerId" name="managerId" defaultValue="">
                      <option value="">Aucun</option>
                      {employeeOptions.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                </div>
                <FormField label="Notes internes" htmlFor="notes">
                  <Textarea id="notes" name="notes" rows={2} />
                </FormField>
              </FormDialog>
            ) : null}
          </div>

          {employees.items.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<UserRound />}
                title="Aucun employé"
                description="Créez un premier dossier employé pour suivre contrats, congés et présences."
              />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Poste</TableHead>
                    <TableHead>Département</TableHead>
                    <TableHead>Contrat</TableHead>
                    <TableHead>Embauche</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Fiche</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.items.map((employee) => (
                    <TableRow key={employee.id}>
                      <TableCell>
                        <Link href={`/app/rh/${employee.id}`} className="font-medium hover:underline">
                          {employee.last_name} {employee.first_name}
                        </Link>
                        {employee.email ? (
                          <p className="text-xs text-muted-foreground">{employee.email}</p>
                        ) : null}
                      </TableCell>
                      <TableCell>{employee.job_title ?? "—"}</TableCell>
                      <TableCell>{employee.department_name ?? "—"}</TableCell>
                      <TableCell>
                        {CONTRACT_TYPE_LABELS[employee.contract_type as keyof typeof CONTRACT_TYPE_LABELS] ??
                          employee.contract_type}
                      </TableCell>
                      <TableCell>{formatDate(employee.hire_date)}</TableCell>
                      <TableCell>
                        <StatusBadge
                          status={employee.status}
                          label={EMPLOYEE_STATUS_LABELS[employee.status as keyof typeof EMPLOYEE_STATUS_LABELS]}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/app/rh/${employee.id}`}
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          Ouvrir
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination
                page={employees.page}
                totalPages={employees.totalPages}
                total={employees.total}
                basePath="/app/rh"
                params={{ vue: "employes", q: params.q, status: params.status, department: params.department }}
              />
            </>
          )}
        </Card>
      ) : null}

      {view === "conges" && leaves ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
            <FilterBar action="/app/rh" q={params.q} placeholder="Rechercher…" hidden={{ vue: "conges" }}>
              <NativeSelect name="status" defaultValue={params.status ?? ""} className="w-auto min-w-[160px]">
                <option value="">Tous les statuts</option>
                {Object.entries(LEAVE_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </FilterBar>
            {canCreate && employeeOptions.length > 0 ? (
              <FormDialog
                trigger={
                  <Button>
                    <CalendarDays /> Nouvelle demande
                  </Button>
                }
                title="Demande de congé"
                description="Une demande en attente doit être validée par une personne habilitée."
                action={createLeaveRequestAction}
                submitLabel="Enregistrer la demande"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Employé" htmlFor="employeeId" required>
                    <NativeSelect id="employeeId" name="employeeId" required defaultValue="">
                      <option value="">Sélectionner…</option>
                      {employeeOptions.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Type" htmlFor="leave-type">
                    <NativeSelect id="leave-type" name="type" defaultValue="annual">
                      {LEAVE_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {LEAVE_TYPE_LABELS[type]}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Début" htmlFor="startDate" required>
                    <Input id="startDate" name="startDate" type="date" required />
                  </FormField>
                  <FormField label="Fin" htmlFor="endDate" required>
                    <Input id="endDate" name="endDate" type="date" required />
                  </FormField>
                  <FormField label="Nombre de jours" htmlFor="days" required>
                    <Input id="days" name="days" type="number" min="0.5" step="0.5" required defaultValue={1} />
                  </FormField>
                </div>
                <FormField label="Motif" htmlFor="reason">
                  <Textarea id="reason" name="reason" rows={2} />
                </FormField>
              </FormDialog>
            ) : null}
          </div>

          {leaves.items.length === 0 ? (
            <div className="p-4">
              <EmptyState icon={<CalendarDays />} title="Aucune demande de congé" description="Les demandes apparaîtront ici avec leur statut." />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employé</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Période</TableHead>
                    <TableHead className="text-right">Jours</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaves.items.map((leave) => (
                    <TableRow key={leave.id}>
                      <TableCell>
                        <Link href={`/app/rh/${leave.employee_id}`} className="font-medium hover:underline">
                          {leave.employee_name}
                        </Link>
                      </TableCell>
                      <TableCell>{LEAVE_TYPE_LABELS[leave.type as keyof typeof LEAVE_TYPE_LABELS] ?? leave.type}</TableCell>
                      <TableCell>
                        {formatDate(leave.start_date)} → {formatDate(leave.end_date)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{Number(leave.days)}</TableCell>
                      <TableCell>
                        <StatusBadge
                          status={leave.status}
                          label={LEAVE_STATUS_LABELS[leave.status as keyof typeof LEAVE_STATUS_LABELS]}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {canValidate && leave.status === "pending" ? (
                            <>
                              <QuickActionButton
                                action={decideLeaveRequestAction}
                                fields={{ id: leave.id, decision: "approved" }}
                                label="Approuver"
                                successMessage="Congé approuvé."
                              />
                              <QuickActionButton
                                action={decideLeaveRequestAction}
                                fields={{ id: leave.id, decision: "rejected" }}
                                label="Refuser"
                                variant="destructive"
                                successMessage="Congé refusé."
                              />
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination
                page={leaves.page}
                totalPages={leaves.totalPages}
                total={leaves.total}
                basePath="/app/rh"
                params={{ vue: "conges", status: params.status }}
              />
            </>
          )}
        </Card>
      ) : null}

      {view === "presences" ? (
        <Card>
          <CardHeader>
            <CardTitle>Pointage</CardTitle>
            <CardDescription>
              Enregistrez la présence quotidienne d&apos;un employé. Un pointage existant pour la
              même date est mis à jour.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {canUpdate && employeeOptions.length > 0 ? (
              <FormDialog
                trigger={
                  <Button>
                    <Plus /> Enregistrer un pointage
                  </Button>
                }
                title="Pointage quotidien"
                action={recordAttendanceAction}
                submitLabel="Enregistrer"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Employé" htmlFor="attendance-employee" required>
                    <NativeSelect id="attendance-employee" name="employeeId" required defaultValue="">
                      <option value="">Sélectionner…</option>
                      {employeeOptions.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Date" htmlFor="workDate" required>
                    <Input id="workDate" name="workDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
                  </FormField>
                  <FormField label="Statut" htmlFor="attendance-status">
                    <NativeSelect id="attendance-status" name="status" defaultValue="present">
                      <option value="present">Présent</option>
                      <option value="remote">Télétravail</option>
                      <option value="late">En retard</option>
                      <option value="leave">Congé</option>
                      <option value="absent">Absent</option>
                    </NativeSelect>
                  </FormField>
                  <FormField label="Arrivée" htmlFor="checkIn">
                    <Input id="checkIn" name="checkIn" type="time" />
                  </FormField>
                  <FormField label="Départ" htmlFor="checkOut">
                    <Input id="checkOut" name="checkOut" type="time" />
                  </FormField>
                </div>
                <FormField label="Notes" htmlFor="attendance-notes">
                  <Textarea id="attendance-notes" name="notes" rows={2} />
                </FormField>
              </FormDialog>
            ) : (
              <p className="text-sm text-muted-foreground">
                Vous n&apos;avez pas la permission de modifier le pointage.
              </p>
            )}

            <p className="text-sm text-muted-foreground">
              L&apos;historique détaillé est visible sur la fiche de chaque employé (30 derniers
              pointages). Aucun calcul d&apos;heures supplémentaires n&apos;est effectué.
            </p>
          </CardContent>
        </Card>
      ) : null}

    </div>
  );
}
