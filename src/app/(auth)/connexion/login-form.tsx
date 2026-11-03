"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, mfaLoginAction } from "../actions";
import { FormFeedback, SubmitButton } from "@/components/forms/form-dialog";
import { FormField, Input } from "@/components/ui/input";

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, null);
  const [mfaState, mfaFormAction] = useActionState(mfaLoginAction, null);
  const challenge =
    state && !state.ok && state.code === "mfa_required"
      ? (state.data as { challenge?: string } | undefined)?.challenge
      : undefined;

  if (challenge) {
    return (
      <form action={mfaFormAction} className="space-y-4">
        <FormFeedback state={mfaState} />
        <p className="text-sm text-muted-foreground">
          Double authentification active sur ce compte. Ouvrez votre application d&apos;authentification
          (Google Authenticator, Authy, 1Password…) et saisissez le code affiché, ou un code de secours.
        </p>
        <input type="hidden" name="challenge" value={challenge} />
        <FormField label="Code de vérification" htmlFor="code" required>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            placeholder="123456"
            className="tracking-[0.3em]"
          />
        </FormField>
        <SubmitButton label="Vérifier" pendingLabel="Vérification…" className="w-full" />
        <Link href="/connexion" className="block text-center text-sm text-primary hover:underline">
          Recommencer la connexion
        </Link>
      </form>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <FormFeedback state={state} />
      <FormField label="Adresse e-mail" htmlFor="email" required>
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="vous@organisation.com" />
      </FormField>
      <FormField label="Mot de passe" htmlFor="password" required>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </FormField>
      <div className="flex items-center justify-between text-sm">
        <Link href="/mot-de-passe-oublie" className="text-primary hover:underline">
          Mot de passe oublié ?
        </Link>
      </div>
      <SubmitButton label="Se connecter" pendingLabel="Connexion…" className="w-full" />
    </form>
  );
}
