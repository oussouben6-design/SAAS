import type { Metadata } from "next";
import { Building2, Plus, Trash2 } from "lucide-react";
import { requirePagePermission, can, listMemberships } from "@/lib/server/context";
import { getOrganization, listDepartments } from "@/modules/organization/service";
import { EmptyState, Alert } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { FormDialog, InlineForm } from "@/components/forms/form-dialog";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import {
  createDepartmentAction,
  deleteDepartmentAction,
  switchOrganizationAction,
  updateOrganizationAction,
} from "@/modules/organization/actions";
import { createOrganizationAction } from "@/app/onboarding/actions";
import { CURRENCIES, TIMEZONES } from "@/lib/validation/organization";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Organisation" };

export default async function OrganizationSettingsPage() {
  const context = await requirePagePermission("organization", "read");
  const orgCtx = { userId: context.user.id, organizationId: context.organization!.id };
  const organization = await getOrganization(orgCtx.userId, orgCtx.organizationId);
  const departments = await listDepartments(orgCtx);
  const memberships = await listMemberships(context.user.id);
  const canUpdate = can(context, "organization", "update");
  const canAdminister = can(context, "organization", "administer");

  if (!organization) {
    return <Alert variant="danger">Organisation introuvable.</Alert>;
  }

  return (
    <div className="space-y-5">
      {organization.is_demo ? (
        <Alert variant="warning" title="Organisation de démonstration">
          Cette organisation a été créée par <code>npm run db:seed</code> : clients, projets, factures
          et collaborateurs sont <strong>fictifs</strong>. Ne saisissez pas de données réelles ici.
          Pour repartir d&apos;une base propre : <code>npm run db:reset</code>.
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="size-4" /> Identité de l&apos;organisation
            {organization.is_demo ? (
              <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-warning">
                Démonstration
              </span>
            ) : null}
          </CardTitle>
          <CardDescription>
            Ces informations apparaissent sur les documents et définissent les formats par défaut.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canUpdate ? (
            <InlineForm
              action={updateOrganizationAction}
              submitLabel="Enregistrer les modifications"
              successMessage="Paramètres enregistrés."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Nom commercial" htmlFor="org-name" required>
                  <Input id="org-name" name="name" defaultValue={organization.name} required maxLength={120} />
                </FormField>
                <FormField label="Raison sociale" htmlFor="org-legal">
                  <Input id="org-legal" name="legalName" defaultValue={organization.legal_name ?? ""} maxLength={160} />
                </FormField>
                <FormField label="Secteur d'activité" htmlFor="org-industry">
                  <Input id="org-industry" name="industry" defaultValue={organization.industry ?? ""} maxLength={120} />
                </FormField>
                <FormField label="Site web" htmlFor="org-website">
                  <Input id="org-website" name="website" defaultValue={organization.website ?? ""} maxLength={200} />
                </FormField>
                <FormField label="E-mail" htmlFor="org-email">
                  <Input id="org-email" name="email" type="email" defaultValue={organization.email ?? ""} />
                </FormField>
                <FormField label="Téléphone" htmlFor="org-phone">
                  <Input id="org-phone" name="phone" defaultValue={organization.phone ?? ""} maxLength={40} />
                </FormField>
                <FormField label="Adresse" htmlFor="org-address">
                  <Input id="org-address" name="address" defaultValue={organization.address ?? ""} maxLength={240} />
                </FormField>
                <FormField label="Ville" htmlFor="org-city">
                  <Input id="org-city" name="city" defaultValue={organization.city ?? ""} maxLength={80} />
                </FormField>
                <FormField label="Pays" htmlFor="org-country">
                  <Input id="org-country" name="country" defaultValue={organization.country ?? ""} maxLength={80} />
                </FormField>
                <FormField label="Devise" htmlFor="org-currency" required>
                  <NativeSelect id="org-currency" name="currency" defaultValue={organization.currency}>
                    {CURRENCIES.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
                <FormField label="Fuseau horaire" htmlFor="org-timezone" required>
                  <NativeSelect id="org-timezone" name="timezone" defaultValue={organization.timezone}>
                    {TIMEZONES.map((timezone) => (
                      <option key={timezone} value={timezone}>
                        {timezone}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
                <FormField label="Langue" htmlFor="org-language" required>
                  <NativeSelect id="org-language" name="language" defaultValue={organization.language}>
                    <option value="fr">Français</option>
                    <option value="en">English</option>
                  </NativeSelect>
                </FormField>
              </div>
              <FormField label="Description" htmlFor="org-description">
                <Textarea id="org-description" name="description" rows={3} defaultValue={organization.description ?? ""} />
              </FormField>
              <p className="text-xs text-muted-foreground">
                Identifiant public : <code>{organization.slug}</code> · dernière modification :{" "}
                {formatDateTime(organization.onboarding_completed_at)}
              </p>
            </InlineForm>
          ) : (
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Nom</dt>
                <dd className="text-sm">{organization.name}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Devise</dt>
                <dd className="text-sm">{organization.currency}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Fuseau horaire</dt>
                <dd className="text-sm">{organization.timezone}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Langue</dt>
                <dd className="text-sm">{organization.language}</dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Départements</CardTitle>
            <CardDescription>Structure interne utilisée pour rattacher les collaborateurs.</CardDescription>
          </div>
          {canAdminister ? (
            <FormDialog
              trigger={
                <Button size="sm" variant="outline">
                  <Plus /> Ajouter
                </Button>
              }
              title="Créer un département"
              action={createDepartmentAction}
              submitLabel="Créer"
            >
              <FormField label="Nom" htmlFor="dept-name" required>
                <Input id="dept-name" name="name" required maxLength={120} />
              </FormField>
              <FormField label="Code" htmlFor="dept-code">
                <Input id="dept-code" name="code" maxLength={20} />
              </FormField>
              <FormField label="Description" htmlFor="dept-description">
                <Textarea id="dept-description" name="description" rows={2} />
              </FormField>
            </FormDialog>
          ) : null}
        </CardHeader>
        <CardContent>
          {departments.length === 0 ? (
            <EmptyState
              title="Aucun département"
              description="Créez des départements pour structurer votre organisation (ex. Commercial, Opérations, Finance)."
            />
          ) : (
            <div className="space-y-2">
              {departments.map((department) => (
                <div key={department.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {department.name}
                      {department.code ? (
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">{department.code}</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {department.members_count} collaborateur(s)
                      {department.manager_name ? ` · Responsable : ${department.manager_name}` : ""}
                    </p>
                  </div>
                  {canAdminister ? (
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="icon" aria-label="Supprimer le département">
                          <Trash2 className="size-4 text-danger" />
                        </Button>
                      }
                      title="Supprimer ce département ?"
                      description="Les collaborateurs rattachés seront détachés du département."
                      confirmLabel="Supprimer"
                      action={deleteDepartmentAction}
                      fields={{ id: department.id }}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="size-4" /> Mes organisations
            </CardTitle>
            <CardDescription>
              Vous êtes membre de {memberships.length} organisation(s). L&apos;organisation active
              détermine les données affichées et les permissions appliquées.
            </CardDescription>
          </div>
          <FormDialog
            trigger={
              <Button variant="outline">
                <Plus /> Créer une organisation
              </Button>
            }
            title="Créer une organisation"
            description="Vous en devenez propriétaire avec le rôle Administrateur, avec les mêmes identifiants de connexion."
            action={createOrganizationAction}
            submitLabel="Créer et basculer"
          >
            <FormField label="Nom de l'organisation" htmlFor="new-org-name" required>
              <Input id="new-org-name" name="name" required maxLength={120} />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Secteur" htmlFor="new-org-industry">
                <Input id="new-org-industry" name="industry" maxLength={120} />
              </FormField>
              <FormField label="Pays" htmlFor="new-org-country">
                <Input id="new-org-country" name="country" maxLength={80} />
              </FormField>
              <FormField label="Ville" htmlFor="new-org-city">
                <Input id="new-org-city" name="city" maxLength={80} />
              </FormField>
              <FormField label="Devise" htmlFor="new-org-currency">
                <NativeSelect id="new-org-currency" name="currency" defaultValue="XOF">
                  {CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField label="Fuseau horaire" htmlFor="new-org-timezone">
                <NativeSelect id="new-org-timezone" name="timezone" defaultValue="Africa/Niamey">
                  {TIMEZONES.map((timezone) => (
                    <option key={timezone} value={timezone}>
                      {timezone}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField label="Langue" htmlFor="new-org-language">
                <NativeSelect id="new-org-language" name="language" defaultValue="fr">
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                </NativeSelect>
              </FormField>
            </div>
          </FormDialog>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {memberships.map((membership) => {
              const isActive = membership.organization_id === context.organization!.id;
              return (
                <div
                  key={membership.organization_id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {membership.name}
                      {isActive ? (
                        <span className="ml-2 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">
                          Active
                        </span>
                      ) : null}
                      {membership.is_demo ? (
                        <span className="ml-2 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning">
                          Démo
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {membership.slug} · {membership.currency} · {membership.timezone}
                    </p>
                  </div>
                  {isActive ? null : (
                    <InlineForm
                      action={switchOrganizationAction}
                      submitLabel="Activer"
                      successMessage="Organisation active changée."
                    >
                      <input type="hidden" name="organizationId" value={membership.organization_id} />
                    </InlineForm>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
