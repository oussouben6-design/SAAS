"use client";

import { useActionState } from "react";
import Link from "next/link";
import { forgotPasswordAction } from "../actions";
import { FormFeedback, SubmitButton } from "@/components/forms/form-dialog";
import { FormField, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(forgotPasswordAction, null);
  const data = (state?.ok ? state.data : null) as
    | { previewUrl?: string | null; warning?: string | null }
    | null;

  return (
    <form action={formAction} className="space-y-4">
      <FormFeedback state={state} />
      {state?.ok && data?.previewUrl ? (
        <Alert variant="warning" title="Mode développement — aucun e-mail envoyé">
          <Link href={data.previewUrl} className="break-all font-medium underline">
            {data.previewUrl}
          </Link>
        </Alert>
      ) : null}
      {state?.ok && data?.warning && !data.previewUrl ? (
        <Alert variant="warning">{data.warning}</Alert>
      ) : null}
      <FormField label="Adresse e-mail" htmlFor="email" required>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </FormField>
      <SubmitButton label="Envoyer le lien" pendingLabel="Envoi…" className="w-full" />
    </form>
  );
}
