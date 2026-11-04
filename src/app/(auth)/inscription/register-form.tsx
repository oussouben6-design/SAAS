"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registerAction } from "../actions";
import { FormFeedback, SubmitButton } from "@/components/forms/form-dialog";
import { FormField, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { AuthDivider, GoogleSignInButton } from "@/components/layout/google-signin";

interface RegisterData {
  previewUrl?: string | null;
}

export function RegisterForm({ googleEnabled = false }: { googleEnabled?: boolean }) {
  const [state, formAction] = useActionState(registerAction, null);

  if (state?.ok) {
    const data = (state.data ?? {}) as RegisterData;
    return (
      <div className="space-y-4">
        <Alert variant="success" title="Compte créé">
          {state.message}
        </Alert>
        {data.previewUrl ? (
          <Alert variant="warning" title="Mode développement — aucun e-mail envoyé">
            <Link href={data.previewUrl} className="break-all font-medium underline">
              {data.previewUrl}
            </Link>
          </Alert>
        ) : null}
        <Link href="/connexion" className="inline-block text-sm font-medium text-primary hover:underline">
          Aller à la connexion →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {googleEnabled ? (
        <>
          <GoogleSignInButton />
          <AuthDivider />
        </>
      ) : null}
      <form action={formAction} className="space-y-4">
        <FormFeedback state={state} />
        <FormField label="Nom complet" htmlFor="fullName" required>
          <Input id="fullName" name="fullName" autoComplete="name" required placeholder="Amina Diallo" />
        </FormField>
        <FormField label="Adresse e-mail" htmlFor="email" required>
          <Input id="email" name="email" type="email" autoComplete="email" required placeholder="vous@organisation.com" />
        </FormField>
        <FormField
          label="Mot de passe"
          htmlFor="password"
          required
          hint="10 caractères minimum, avec au moins une lettre et un chiffre."
        >
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
        </FormField>
        <FormField label="Confirmer le mot de passe" htmlFor="confirmPassword" required>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
          />
        </FormField>
        <SubmitButton label="Créer mon compte" pendingLabel="Création…" className="w-full" />
      </form>
    </div>
  );
}
