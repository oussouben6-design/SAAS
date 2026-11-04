"use client";

import { useActionState } from "react";
import { FormFeedback, SubmitButton } from "@/components/forms/form-dialog";
import { FormField, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  confirmMfaEnrollmentAction,
  disableMfaAction,
  startMfaEnrollmentAction,
} from "@/modules/profile/mfa-actions";
/** Groupage lisible du secret (4 caractères) — duplication volontaire : `totp.ts` importe node:crypto. */
function formatSecret(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

export function MfaEnrollmentPanel() {
  const [startState, startAction] = useActionState(startMfaEnrollmentAction, null);
  const [confirmState, confirmAction] = useActionState(confirmMfaEnrollmentAction, null);
  const enrollment = startState?.ok ? (startState.data as { secret: string; uri: string }) : undefined;
  const recoveryCodes = confirmState?.ok
    ? ((confirmState.data as { recoveryCodes: string[] } | undefined)?.recoveryCodes ?? [])
    : [];

  return (
    <div className="space-y-5">
      <FormFeedback state={startState} />
      {!enrollment ? (
        <form action={startAction}>
          <SubmitButton label="Activer la double authentification" pendingLabel="Préparation…" />
        </form>
      ) : (
        <div className="space-y-4">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              Ouvrez votre application d&apos;authentification (Google Authenticator, Authy, 1Password,
              Bitwarden…) et ajoutez un compte manuellement.
            </li>
            <li>
              Saisissez le secret ci-dessous (ou collez le lien <code>otpauth://</code> dans un générateur de
              QR code local).
            </li>
            <li>Confirmez avec le code à 6 chiffres affiché par l&apos;application.</li>
          </ol>
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Secret (base32)</p>
            <p className="select-all break-all font-mono text-sm">{formatSecret(enrollment.secret)}</p>
            <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Lien otpauth</p>
            <p className="select-all break-all font-mono text-[11px] text-muted-foreground">{enrollment.uri}</p>
          </div>
          <form action={confirmAction} className="space-y-3">
            <FormFeedback state={confirmState} />
            <FormField label="Code de vérification" htmlFor="mfa-code" required>
              <Input
                id="mfa-code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                placeholder="123456"
                className="max-w-40 tracking-[0.3em]"
              />
            </FormField>
            <SubmitButton label="Confirmer l'activation" pendingLabel="Vérification…" />
          </form>
          {recoveryCodes.length > 0 ? (
            <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
              <p className="text-sm font-medium">Codes de secours (affichés une seule fois)</p>
              <p className="text-xs text-muted-foreground">
                Conservez-les hors ligne : chacun permet une connexion unique si vous perdez votre téléphone.
              </p>
              <div className="grid grid-cols-2 gap-1 font-mono text-sm sm:grid-cols-3">
                {recoveryCodes.map((value) => (
                  <span key={value} className="select-all rounded bg-background px-2 py-1">
                    {value}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function MfaDisableForm() {
  const [state, formAction] = useActionState(disableMfaAction, null);
  return (
    <form action={formAction} className="space-y-3">
      <FormFeedback state={state} />
      <FormField label="Mot de passe actuel" htmlFor="mfa-password" required>
        <Input id="mfa-password" name="password" type="password" autoComplete="current-password" required />
      </FormField>
      <Button type="submit" variant="outline">
        Désactiver la double authentification
      </Button>
    </form>
  );
}
