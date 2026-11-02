"use client";

import { useActionState } from "react";
import Link from "next/link";
import { acceptInvitationAction } from "./actions";
import { FormFeedback, SubmitButton } from "@/components/forms/form-dialog";
import { FormField, Input } from "@/components/ui/input";

export function AcceptInvitationForm({
  token,
  fullName,
  requiresPassword,
}: {
  token: string;
  fullName: string;
  requiresPassword: boolean;
}) {
  const [state, formAction] = useActionState(acceptInvitationAction, null);

  if (!requiresPassword) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          Un compte actif existe déjà avec cette adresse e-mail. Connectez-vous avec votre mot de passe
          pour rejoindre l&apos;organisation.
        </p>
        <Link href="/connexion" className="text-sm font-medium text-primary hover:underline">
          Se connecter →
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {state?.ok ? <FormFeedback state={state} /> : null}
      <FormField label="Nom complet" htmlFor="fullName" required>
        <Input id="fullName" name="fullName" defaultValue={fullName} required autoComplete="name" />
      </FormField>
      <FormField
        label="Créer un mot de passe"
        htmlFor="password"
        required
        hint="10 caractères minimum, avec au moins une lettre et un chiffre."
      >
        <Input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" />
      </FormField>
      <SubmitButton label="Rejoindre l'organisation" pendingLabel="Activation…" className="w-full" />
    </form>
  );
}
