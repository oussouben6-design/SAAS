"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resetPasswordAction } from "../actions";
import { FormFeedback, SubmitButton } from "@/components/forms/form-dialog";
import { FormField, Input } from "@/components/ui/input";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(resetPasswordAction, null);

  if (state?.ok) {
    return (
      <div className="space-y-4">
        <FormFeedback state={state} />
        <Link href="/connexion" className="inline-block text-sm font-medium text-primary hover:underline">
          Se connecter →
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <FormFeedback state={state} />
      <FormField
        label="Nouveau mot de passe"
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
      <SubmitButton label="Mettre à jour le mot de passe" pendingLabel="Mise à jour…" className="w-full" />
    </form>
  );
}
