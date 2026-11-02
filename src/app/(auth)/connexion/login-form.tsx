"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "../actions";
import { FormFeedback, SubmitButton } from "@/components/forms/form-dialog";
import { FormField, Input } from "@/components/ui/input";

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, null);

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
