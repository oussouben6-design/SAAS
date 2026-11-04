import type { Metadata } from "next";
import { KeyRound, Laptop, MailCheck, ShieldAlert, UserRound } from "lucide-react";
import { requireUser, getAppContext } from "@/lib/server/context";
import { asUser } from "@/lib/db";
import { PageHeader, Alert } from "@/components/ui/misc";
import { Avatar } from "@/components/ui/misc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, Input } from "@/components/ui/input";
import { InlineForm } from "@/components/forms/form-dialog";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  changePasswordAction,
  resendVerificationAction,
  revokeOtherSessionsAction,
  revokeSessionAction,
  setInitialPasswordAction,
  updateProfileAction,
} from "@/modules/profile/actions";
import { readSessionToken } from "@/lib/auth/cookies";
import { hasPasswordCredentials, listUserSessions } from "@/lib/auth/service";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Mon profil" };

/** Résumé lisible du User-Agent (aucune librairie externe). */
function describeUserAgent(userAgent: string | null): string {
  if (!userAgent) return "Appareil inconnu";
  const rules: { test: RegExp; label: string }[] = [
    { test: /Edg\//i, label: "Microsoft Edge" },
    { test: /OPR\/|Opera/i, label: "Opera" },
    { test: /Firefox\//i, label: "Firefox" },
    { test: /Chrome\//i, label: "Chrome" },
    { test: /Safari\//i, label: "Safari" },
    { test: /curl\//i, label: "Ligne de commande (curl)" },
  ];
  const browser = rules.find((rule) => rule.test.test(userAgent))?.label ?? "Navigateur";
  const platform = /Windows/i.test(userAgent)
    ? "Windows"
    : /Android/i.test(userAgent)
      ? "Android"
      : /iPhone|iPad|iOS/i.test(userAgent)
        ? "iOS"
        : /Mac OS X/i.test(userAgent)
          ? "macOS"
          : /Linux/i.test(userAgent)
            ? "Linux"
            : "";
  return platform ? `${browser} · ${platform}` : browser;
}

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
  const token = await readSessionToken();
  const sessions = await listUserSessions(user.id, token);
  const hasPassword = await hasPasswordCredentials(user.id);

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
            {hasPassword
              ? "Le changement de mot de passe déconnecte toutes les autres sessions actives."
              : "Votre compte a été créé avec Google : aucun mot de passe n'est encore défini. Définissez-en un pour pouvoir aussi vous connecter par e-mail."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasPassword ? (
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
          ) : (
            <InlineForm action={setInitialPasswordAction} submitLabel="Définir le mot de passe">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Mot de passe" htmlFor="new-password" required hint="10 caractères minimum, avec au moins une lettre et un chiffre.">
                  <Input id="new-password" name="password" type="password" required minLength={10} autoComplete="new-password" />
                </FormField>
                <FormField label="Confirmer" htmlFor="confirm-password" required>
                  <Input id="confirm-password" name="confirmPassword" type="password" required minLength={10} autoComplete="new-password" />
                </FormField>
              </div>
            </InlineForm>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Laptop className="size-4" /> Sessions actives
            </CardTitle>
            <CardDescription>
              {sessions.length} session(s) valide(s). Révoquez toute session que vous ne reconnaissez pas.
            </CardDescription>
          </div>
          {sessions.length > 1 ? (
            <ConfirmDialog
              trigger={
                <Button variant="outline" size="sm">
                  Déconnecter les autres appareils
                </Button>
              }
              title="Déconnecter toutes les autres sessions ?"
              description="Les autres navigateurs et appareils devront se reconnecter. Votre session actuelle est conservée."
              confirmLabel="Déconnecter"
              action={revokeOtherSessionsAction}
              fields={{}}
            />
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Appareil</TableHead>
                <TableHead>Adresse IP</TableHead>
                <TableHead>Dernière activité</TableHead>
                <TableHead>Expire le</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => (
                <TableRow key={session.id}>
                  <TableCell className="max-w-[280px]">
                    <p className="truncate text-sm" title={session.userAgent ?? "Inconnu"}>
                      {describeUserAgent(session.userAgent)}
                    </p>
                    <p className="text-xs text-muted-foreground">Créée le {formatDateTime(session.createdAt)}</p>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{session.ip ?? "—"}</TableCell>
                  <TableCell className="text-xs">{formatDateTime(session.lastUsedAt)}</TableCell>
                  <TableCell className="text-xs">{formatDateTime(session.expiresAt)}</TableCell>
                  <TableCell className="text-right">
                    {session.isCurrent ? (
                      <Badge variant="success">Session actuelle</Badge>
                    ) : (
                      <ConfirmDialog
                        trigger={
                          <Button variant="ghost" size="sm">
                            Déconnecter
                          </Button>
                        }
                        title="Déconnecter cette session ?"
                        confirmLabel="Déconnecter"
                        action={revokeSessionAction}
                        fields={{ sessionId: session.id }}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
