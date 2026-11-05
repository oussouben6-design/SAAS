import type { Metadata } from "next";
import { KeyRound, MailPlus, Pencil, Trash2, UserCheck, UserX } from "lucide-react";
import { requirePagePermission, can } from "@/lib/server/context";
import { listDepartments, listMembers, listRoles } from "@/modules/organization/service";
import { PageHeader, EmptyState, Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormField, Input, NativeSelect } from "@/components/ui/input";
import { FormDialog } from "@/components/forms/form-dialog";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { QuickActionButton } from "@/components/forms/quick-action";
import { StatusBadge } from "@/components/shared/filters";
import {
  inviteMemberAction,
  removeMemberAction,
  setMemberStatusAction,
  updateMemberAction,
} from "@/modules/organization/actions";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Équipe" };

export default async function TeamPage() {
  const context = await requirePagePermission("members", "read");
  const orgCtx = { userId: context.user.id, organizationId: context.organization!.id };

  const [members, roles, departments] = await Promise.all([
    listMembers(orgCtx),
    listRoles(orgCtx),
    listDepartments(orgCtx),
  ]);

  const canInvite = can(context, "members", "create");
  const canAdminister = can(context, "members", "administer");
  const canDelete = can(context, "members", "delete");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Équipe"
        description="Invitez des collaborateurs, attribuez des rôles et gérez les accès."
        actions={
          canInvite ? (
            <FormDialog
              trigger={
                <Button>
                  <MailPlus /> Inviter un collaborateur
                </Button>
              }
              title="Inviter un collaborateur"
              description="Un lien d'invitation valable 7 jours est généré. Aucun e-mail n'est envoyé si aucun transport n'est configuré."
              action={inviteMemberAction}
              submitLabel="Créer l'invitation"
              className="max-w-xl"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Nom complet" htmlFor="invite-name" required>
                  <Input id="invite-name" name="fullName" required maxLength={120} />
                </FormField>
                <FormField label="Adresse e-mail" htmlFor="invite-email" required>
                  <Input id="invite-email" name="email" type="email" required />
                </FormField>
                <FormField label="Fonction" htmlFor="invite-job">
                  <Input id="invite-job" name="jobTitle" maxLength={120} />
                </FormField>
                <FormField label="Département" htmlFor="invite-department">
                  <NativeSelect id="invite-department" name="departmentId" defaultValue="">
                    <option value="">Aucun</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Rôles</legend>
                {roles.map((role) => (
                  <label key={role.id} className="flex items-start gap-2 text-sm">
                    <input type="checkbox" name="roleKeys" value={role.key} className="mt-0.5 size-4 rounded border-input" />
                    <span>
                      <span className="font-medium">{role.name}</span>
                      <span className="block text-xs text-muted-foreground">{role.description}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            </FormDialog>
          ) : null
        }
      />

      {!canAdminister ? (
        <Alert variant="info">
          Votre rôle permet de consulter l&apos;équipe, mais pas de modifier les rôles ni les accès.
        </Alert>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Collaborateurs ({members.length})</CardTitle>
          <CardDescription>
            Les comptes suspendus conservent leurs données mais perdent l&apos;accès à l&apos;organisation.
          </CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Collaborateur</TableHead>
              <TableHead>Rôles</TableHead>
              <TableHead>Département</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Arrivée</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id}>
                <TableCell>
                  <p className="font-medium">
                    {member.full_name}
                    {member.is_owner ? <Badge variant="primary" className="ml-2">Propriétaire</Badge> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">{member.email}</p>
                  {member.job_title ? <p className="text-xs text-muted-foreground">{member.job_title}</p> : null}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {member.roles.length === 0 ? (
                      <span className="text-xs text-muted-foreground">Aucun rôle</span>
                    ) : (
                      member.roles.map((role) => (
                        <Badge key={role.id} variant="outline">
                          {role.name}
                        </Badge>
                      ))
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-xs">{member.department_name ?? "—"}</TableCell>
                <TableCell>
                  <StatusBadge status={member.status} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {member.joined_at ? formatDate(member.joined_at) : "Invitation en attente"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    {canAdminister && !member.is_owner ? (
                      <>
                        <FormDialog
                          trigger={
                            <Button variant="ghost" size="icon" aria-label="Modifier les rôles">
                              <Pencil className="size-4" />
                            </Button>
                          }
                          title={`Modifier ${member.full_name}`}
                          action={updateMemberAction}
                          submitLabel="Enregistrer"
                        >
                          <input type="hidden" name="memberId" value={member.id} />
                          <FormField label="Fonction" htmlFor={`member-job-${member.id}`}>
                            <Input id={`member-job-${member.id}`} name="jobTitle" defaultValue={member.job_title ?? ""} maxLength={120} />
                          </FormField>
                          <FormField label="Département" htmlFor={`member-dept-${member.id}`}>
                            <NativeSelect id={`member-dept-${member.id}`} name="departmentId" defaultValue={member.department_id ?? ""}>
                              <option value="">Aucun</option>
                              {departments.map((department) => (
                                <option key={department.id} value={department.id}>
                                  {department.name}
                                </option>
                              ))}
                            </NativeSelect>
                          </FormField>
                          <fieldset className="space-y-2">
                            <legend className="text-sm font-medium">Rôles</legend>
                            {roles.map((role) => (
                              <label key={role.id} className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  name="roleKeys"
                                  value={role.key}
                                  defaultChecked={member.roles.some((assigned) => assigned.key === role.key)}
                                  className="size-4 rounded border-input"
                                />
                                {role.name}
                              </label>
                            ))}
                          </fieldset>
                        </FormDialog>

                        <QuickActionButton
                          action={setMemberStatusAction}
                          fields={{
                            memberId: member.id,
                            status: member.status === "suspended" ? "active" : "suspended",
                          }}
                          label=""
                          variant="ghost"
                          icon={
                            member.status === "suspended" ? (
                              <UserCheck className="size-4 text-success" />
                            ) : (
                              <UserX className="size-4 text-warning" />
                            )
                          }
                          successMessage="Statut mis à jour."
                        />
                      </>
                    ) : null}
                    {canDelete && !member.is_owner ? (
                      <ConfirmDialog
                        trigger={
                          <Button variant="ghost" size="icon" aria-label="Retirer le collaborateur">
                            <Trash2 className="size-4 text-danger" />
                          </Button>
                        }
                        title={`Retirer ${member.full_name} ?`}
                        description="Le collaborateur perd immédiatement l'accès à l'organisation. Son compte Excellence 360 CRM est conservé."
                        confirmLabel="Retirer"
                        action={removeMemberAction}
                        fields={{ memberId: member.id }}
                      />
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {members.some((member) => member.status === "invited") ? (
        <Alert variant="warning" title="Invitations en attente">
          Certains collaborateurs n&apos;ont pas encore accepté leur invitation. Ouvrez le lien d&apos;invitation
          généré lors de la création, ou renvoyez une invitation depuis le même écran.
        </Alert>
      ) : null}

      {members.length === 0 ? (
        <EmptyState
          icon={<KeyRound />}
          title="Aucun collaborateur"
          description="Invitez votre premier collaborateur pour commencer à travailler en équipe."
        />
      ) : null}
    </div>
  );
}
