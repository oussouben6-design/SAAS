import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileSignature, Plus, Trash2 } from "lucide-react";
import { requirePagePermission, can } from "@/lib/server/context";
import { getEmployee, listEmployeeOptions } from "@/modules/hr/service";
import { listDepartments } from "@/modules/organization/service";
import { AppError } from "@/lib/server/errors";
import { EmptyState, PageHeader, StatCard } from "@/components/ui/misc";
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
  CONTRACT_TYPES,
  CONTRACT_TYPE_LABELS,
  EMPLOYEE_STATUSES,
  EMPLOYEE_STATUS_LABELS,
  LEAVE_STATUS_LABELS,
  LEAVE_TYPE_LABELS,
} from "@/lib/validation/hr";
import {
  addContractAction,
  decideLeaveRequestAction,
  deleteEmployeeAction,
  setEmployeeStatusAction,
  updateEmployeeAction,
} from "@/modules/hr/actions";

export const metadata: Metadata = { title: "Dossier employé" };

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requirePagePermission("hr", "read");
  const { id } = await params;
  const orgCtx = { userId: context.user.id, organizationId: context.organization!.id };

  let data;
  try {
    data = await getEmployee(orgCtx, id);
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") notFound();
    throw error;
  }
  const { employee, contracts, leaves, attendance } = data;

  const canUpdate = can(context, "hr", "update");
  const canCreate = can(context, "hr", "create");
  const canDelete = can(context, "hr", "delete");
  const canValidate = can(context, "hr", "validate");

  const [departments, managers] = await Promise.all([
    listDepartments(orgCtx),
    listEmployeeOptions(orgCtx),
  ]);

  return (
    <div className="space-y-5">
      <Link href="/app/rh" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Ressources humaines
      </Link>

      <PageHeader
        title={`${employee.first_name} ${employee.last_name}`}
        description={`${employee.job_title ?? "Poste non renseigné"} · ${employee.department_name ?? "aucun département"} · embauche ${formatDate(employee.hire_date)}`}
        badge={
          <StatusBadge
            status={employee.status}
            label={EMPLOYEE_STATUS_LABELS[employee.status as keyof typeof EMPLOYEE_STATUS_LABELS]}
          />
        }
        actions={
          <>
            {canUpdate ? (
              <FormDialog
                trigger={
                  <Button variant="outline">
                    <FileSignature /> Modifier le dossier
                  </Button>
                }
                title="Modifier le dossier employé"
                action={updateEmployeeAction}
                submitLabel="Enregistrer"
              >
                <input type="hidden" name="id" value={employee.id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Prénom" htmlFor="edit-first" required>
                    <Input id="edit-first" name="firstName" required defaultValue={employee.first_name} maxLength={80} />
                  </FormField>
                  <FormField label="Nom" htmlFor="edit-last" required>
                    <Input id="edit-last" name="lastName" required defaultValue={employee.last_name} maxLength={80} />
                  </FormField>
                  <FormField label="E-mail" htmlFor="edit-email">
                    <Input id="edit-email" name="email" type="email" defaultValue={employee.email ?? ""} />
                  </FormField>
                  <FormField label="Téléphone" htmlFor="edit-phone">
                    <Input id="edit-phone" name="phone" defaultValue={employee.phone ?? ""} maxLength={40} />
                  </FormField>
                  <FormField label="Poste" htmlFor="edit-job">
                    <Input id="edit-job" name="jobTitle" defaultValue={employee.job_title ?? ""} maxLength={120} />
                  </FormField>
                  <FormField label="Département" htmlFor="edit-department">
                    <NativeSelect id="edit-department" name="departmentId" defaultValue={employee.department_id ?? ""}>
                      <option value="">Aucun</option>
                      {departments.map((department) => (
                        <option key={department.id} value={department.id}>
                          {department.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Type de contrat" htmlFor="edit-contract">
                    <NativeSelect id="edit-contract" name="contractType" defaultValue={employee.contract_type}>
                      {CONTRACT_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {CONTRACT_TYPE_LABELS[type]}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Statut" htmlFor="edit-status">
                    <NativeSelect id="edit-status" name="status" defaultValue={employee.status}>
                      {EMPLOYEE_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {EMPLOYEE_STATUS_LABELS[status]}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Date d'embauche" htmlFor="edit-hire">
                    <Input id="edit-hire" name="hireDate" type="date" defaultValue={employee.hire_date?.slice(0, 10) ?? ""} />
                  </FormField>
                  <FormField label="Date de fin" htmlFor="edit-end">
                    <Input id="edit-end" name="endDate" type="date" defaultValue={employee.end_date?.slice(0, 10) ?? ""} />
                  </FormField>
                  <FormField label={`Salaire de référence (${employee.currency})`} htmlFor="edit-salary">
                    <Input
                      id="edit-salary"
                      name="baseSalary"
                      defaultValue={
                        employee.base_salary_minor
                          ? String(Number(employee.base_salary_minor) / 10 ** (employee.currency === "XOF" ? 0 : 2))
                          : ""
                      }
                    />
                  </FormField>
                  <FormField label="Responsable" htmlFor="edit-manager">
                    <NativeSelect id="edit-manager" name="managerId" defaultValue={employee.manager_id ?? ""}>
                      <option value="">Aucun</option>
                      {managers
                        .filter((option) => option.id !== employee.id)
                        .map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                    </NativeSelect>
                  </FormField>
                </div>
                <FormField label="Notes" htmlFor="edit-notes">
                  <Textarea id="edit-notes" name="notes" rows={2} defaultValue={employee.notes ?? ""} />
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
                title="Archiver ce dossier ?"
                description="Le dossier sera retiré des listes (suppression logique) et l'opération journalisée. Les contrats et congés restent en base."
                confirmLabel="Archiver le dossier"
                action={deleteEmployeeAction}
                fields={{ id: employee.id }}
              />
            ) : null}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Contrat" value={CONTRACT_TYPE_LABELS[employee.contract_type as keyof typeof CONTRACT_TYPE_LABELS] ?? employee.contract_type} />
        <StatCard label="Salaire de référence" value={formatMoney(employee.base_salary_minor, employee.currency)} hint="Indicatif, hors charges" />
        <StatCard label="Contrats enregistrés" value={contracts.length} />
        <StatCard label="Demandes de congé" value={leaves.length} hint={`${leaves.filter((leave) => leave.status === "pending").length} en attente`} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Contrats</CardTitle>
            <CardDescription>Historique contractuel du collaborateur.</CardDescription>
          </div>
          {canCreate ? (
            <FormDialog
              trigger={
                <Button variant="outline" size="sm">
                  <Plus /> Contrat
                </Button>
              }
              title="Ajouter un contrat"
              action={addContractAction}
              submitLabel="Enregistrer"
            >
              <input type="hidden" name="employeeId" value={employee.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Référence" htmlFor="contract-reference">
                  <Input id="contract-reference" name="reference" maxLength={60} />
                </FormField>
                <FormField label="Type" htmlFor="contract-type">
                  <NativeSelect id="contract-type" name="type" defaultValue="cdi">
                    {CONTRACT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {CONTRACT_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
                <FormField label="Début" htmlFor="contract-start" required>
                  <Input id="contract-start" name="startDate" type="date" required />
                </FormField>
                <FormField label="Fin" htmlFor="contract-end">
                  <Input id="contract-end" name="endDate" type="date" />
                </FormField>
                <FormField label={`Salaire (${employee.currency})`} htmlFor="contract-salary">
                  <Input id="contract-salary" name="salary" />
                </FormField>
                <FormField label="Signé le" htmlFor="contract-signed">
                  <Input id="contract-signed" name="signedAt" type="date" />
                </FormField>
              </div>
              <FormField label="Notes" htmlFor="contract-notes">
                <Textarea id="contract-notes" name="notes" rows={2} />
              </FormField>
            </FormDialog>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          {contracts.length === 0 ? (
            <div className="p-4">
              <EmptyState icon={<FileSignature />} title="Aucun contrat" description="Ajoutez le contrat en cours pour conserver l'historique." />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Référence</TableHead>
                  <TableHead>Période</TableHead>
                  <TableHead className="text-right">Salaire</TableHead>
                  <TableHead>Signé le</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.map((contract) => (
                  <TableRow key={contract.id}>
                    <TableCell>{CONTRACT_TYPE_LABELS[contract.type as keyof typeof CONTRACT_TYPE_LABELS] ?? contract.type}</TableCell>
                    <TableCell>{contract.reference ?? "—"}</TableCell>
                    <TableCell>
                      {formatDate(contract.start_date)} → {formatDate(contract.end_date)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(contract.salary_minor, contract.currency)}
                    </TableCell>
                    <TableCell>{formatDate(contract.signed_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Congés</CardTitle>
            <CardDescription>Demandes et décisions rattachées à ce collaborateur.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {leaves.length === 0 ? (
              <div className="p-4">
                <EmptyState icon={<Plus />} title="Aucune demande" description="Créez les demandes depuis l'onglet Congés." />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Période</TableHead>
                    <TableHead className="text-right">Jours</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Décision</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaves.map((leave) => (
                    <TableRow key={leave.id}>
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
                      <TableCell className="text-right">
                        {canValidate && leave.status === "pending" ? (
                          <div className="flex justify-end gap-1.5">
                            <QuickActionButton
                              action={decideLeaveRequestAction}
                              fields={{ id: leave.id, decision: "approved" }}
                              label="Approuver"
                            />
                            <QuickActionButton
                              action={decideLeaveRequestAction}
                              fields={{ id: leave.id, decision: "rejected" }}
                              label="Refuser"
                              variant="ghost"
                            />
                          </div>
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
          <CardHeader>
            <CardTitle>Présences récentes</CardTitle>
            <CardDescription>30 derniers pointages enregistrés.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {attendance.length === 0 ? (
              <div className="p-4">
                <EmptyState icon={<Plus />} title="Aucun pointage" description="Enregistrez les présences depuis l'onglet Présences." />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Arrivée</TableHead>
                    <TableHead>Départ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attendance.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>{formatDate(record.work_date)}</TableCell>
                      <TableCell>
                        <StatusBadge status={record.status} />
                      </TableCell>
                      <TableCell>{record.check_in ?? "—"}</TableCell>
                      <TableCell>{record.check_out ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {canUpdate && employee.status !== "ended" ? (
        <div className="flex flex-wrap gap-2">
          <QuickActionButton
            action={setEmployeeStatusAction}
            fields={{ id: employee.id, status: "active" }}
            label="Marquer actif"
            successMessage="Statut mis à jour."
          />
          <QuickActionButton
            action={setEmployeeStatusAction}
            fields={{ id: employee.id, status: "on_leave" }}
            label="Marquer en congé"
          />
          <QuickActionButton
            action={setEmployeeStatusAction}
            fields={{ id: employee.id, status: "ended" }}
            label="Marquer sorti"
            variant="ghost"
          />
        </div>
      ) : null}
    </div>
  );
}
