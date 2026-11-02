import type { Metadata } from "next";
import { KeyRound, MailCheck, ShieldAlert, UserRound } from "lucide-react";
import { requireUser, getAppContext } from "@/lib/server/context";
import { asUser } from "@/lib/db";
import { PageHeader, Alert } from "@/components/ui/misc";
import { Avatar } from "@/components/ui/misc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, Input } from "@/components/ui/input";
import { InlineForm } from "@/components/forms/form-dialog";
import { changePasswordAction, resendVerificationAction, updateProfileAction } from "@/modules/profile/actions";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Mon profil" };

export default async function ProfilePage() {
  const user = await requireUser();
  const context = await getAppContext();
  const rows = await asUser(user.id, (tx) =>
    tx.query<{ phone: string | null; job_title: string | null; created_at: string; last_seen_at: string | null }>(
      "select phone, job_title, created_at, last_seen_at from profiles where id = $1",
      [user.id],
    ),
  );
  const profile = rows[0];

  return (
    <div className="space-y-5">
      <PageHeader title="Mon profil" description="Informations personnelles et sécurité du compte." />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserRound className="size-4" /> Informations personnelles
          </CardTitle>
          <CardDescription>Votre nom apparaît dans les journaux, commentaires et notifications.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar name={user.fullName} src={user.avatarUrl} className="size-12 text-sm" />
            <div>
              <p className="text-sm font-medium">{user.email}</p>
              <p className="text-xs text-muted-foreground">
                Compte créé le {formatDateTime(profile?.created_at)}
                {profile?.last_seen_at ? ` · dernière connexion ${formatDateTime(profile.last_seen_at)}` : ""}
              </p>
            </div>
          </div>
          <InlineForm action={updateProfileAction} submitLabel="Enregistrer le profil" successMessage="Profil mis à jour.">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Nom complet" htmlFor="profile-name" required>
                <Input id="profile-name" name="fullName" defaultValue={user.fullName} required maxLength={120} />
              </FormField>
              <FormField label="Téléphone" htmlFor="profile-phone">
                <Input id="profile-phone" name="phone" defaultValue={profile?.phone ?? ""} maxLength={40} />
              </FormField>
              <FormField label="Fonction" htmlFor="profile-job">
                <Input id="profile-job" name="jobTitle" defaultValue={profile?.job_title ?? ""} maxLength={120} />
              </FormField>
            </div>
          </InlineForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MailCheck className="size-4" /> Vérification de l&apos;adresse e-mail
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {user.emailVerifiedAt ? (
            <Alert variant="success">Adresse vérifiée le {formatDateTime(user.emailVerifiedAt)}.</Alert>
          ) : (
            <>
              <Alert variant="warning" title="Adresse non vérifiée">
                Aucun transport d&apos;e-mail n&apos;étant configuré, la vérification n&apos;est pas obligatoire
                pour se connecter. Vous pouvez générer un lien de vérification ci-dessous.
              </Alert>
              <InlineForm action={resendVerificationAction} submitLabel="Générer un lien de vérification">
                <p className="text-xs text-muted-foreground">
                  En développement, le lien est affiché dans la notification de succès.
                </p>
              </InlineForm>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-4" /> Mot de passe
          </CardTitle>
          <CardDescription>
            Le changement de mot de passe déconnecte toutes les autres sessions actives.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InlineForm action={changePasswordAction} submitLabel="Changer le mot de passe">
            <FormField label="Mot de passe actuel" htmlFor="current-password" required>
              <Input id="current-password" name="currentPassword" type="password" required autoComplete="current-password" />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Nouveau mot de passe" htmlFor="new-password" required hint="10 caractères minimum.">
                <Input id="new-password" name="password" type="password" required minLength={10} autoComplete="new-password" />
              </FormField>
              <FormField label="Confirmer" htmlFor="confirm-password" required>
                <Input id="confirm-password" name="confirmPassword" type="password" required minLength={10} autoComplete="new-password" />
              </FormField>
            </div>
          </InlineForm>
        </CardContent>
      </Card>

      {context?.member ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="size-4" /> Mes droits dans {context.organization?.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Rôles : <span className="font-medium">{context.member.roleKeys.join(", ")}</span>
            </p>
            <p className="text-muted-foreground">
              {context.permissions.size} permission(s) accordée(s). Contactez un administrateur pour toute
              évolution de vos droits.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
