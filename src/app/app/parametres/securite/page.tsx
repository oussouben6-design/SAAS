import type { Metadata } from "next";
import { KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import { requireUser } from "@/lib/server/context";
import { getMfaState } from "@/lib/auth/mfa";
import { PageHeader, Alert } from "@/components/ui/misc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { MfaDisableForm, MfaEnrollmentPanel } from "./mfa-panel";

export const metadata: Metadata = { title: "Sécurité" };

export default async function SecurityPage() {
  const user = await requireUser();
  const mfa = await getMfaState(user.id);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sécurité du compte"
        description="Double authentification par application mobile (TOTP, compatible Google Authenticator)."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {mfa.enabled ? <ShieldCheck className="size-4" /> : <ShieldOff className="size-4" />}
            Double authentification
            <Badge variant={mfa.enabled ? "success" : "outline"}>{mfa.enabled ? "Activée" : "Désactivée"}</Badge>
          </CardTitle>
          <CardDescription>
            En plus du mot de passe, un code à 6 chiffres renouvelé toutes les 30 secondes sera demandé à
            chaque connexion.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!mfa.available ? (
            <Alert variant="warning" title="Fonctionnalité indisponible sur ce serveur">
              La variable <code>MFA_ENCRYPTION_KEY</code> n&apos;est pas configurée : le secret ne peut pas être
              chiffré, donc l&apos;activation est refusée. Générez une clé avec{" "}
              <code>openssl rand -base64 32</code>, ajoutez-la à la configuration du serveur puis redémarrez.
            </Alert>
          ) : mfa.enabled ? (
            <>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <KeyRound className="size-3.5" /> Activée le {formatDateTime(mfa.confirmedAt)}
                </span>
                <span>Dernière utilisation : {mfa.lastUsedAt ? formatDateTime(mfa.lastUsedAt) : "jamais"}</span>
                <span>Codes de secours restants : {mfa.recoveryCodesRemaining}</span>
              </div>
              {mfa.recoveryCodesRemaining === 0 ? (
                <Alert variant="warning" title="Plus aucun code de secours">
                  Désactivez puis réactivez la double authentification pour générer une nouvelle série de codes.
                </Alert>
              ) : null}
              <p className="text-sm text-muted-foreground">
                Pour désactiver la double authentification, confirmez votre mot de passe. Les autres sessions
                ouvertes seront déconnectées.
              </p>
              <MfaDisableForm />
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                L&apos;activation nécessite une application d&apos;authentification. Le secret est chiffré en
                AES-256-GCM : il n&apos;est jamais stocké en clair.
              </p>
              <MfaEnrollmentPanel />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
