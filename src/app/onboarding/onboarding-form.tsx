"use client";

import { useActionState } from "react";
import { createOrganizationAction } from "./actions";
import { FormFeedback, SubmitButton } from "@/components/forms/form-dialog";
import { FormField, Input, NativeSelect } from "@/components/ui/input";
import { CURRENCIES, TIMEZONES } from "@/lib/validation/organization";

export function OnboardingForm() {
  const [state, formAction] = useActionState(createOrganizationAction, null);

  return (
    <form action={formAction} className="space-y-5">
      <FormFeedback state={state} />
      <FormField label="Nom de l'organisation" htmlFor="name" required>
        <Input id="name" name="name" required minLength={2} maxLength={120} placeholder="Ex. Sahel Conseil" />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Secteur d'activité" htmlFor="industry" hint="Facultatif — ex. services, commerce, santé.">
          <Input id="industry" name="industry" maxLength={120} />
        </FormField>
        <FormField label="Pays" htmlFor="country">
          <Input id="country" name="country" maxLength={80} placeholder="Niger" />
        </FormField>
        <FormField label="Ville" htmlFor="city">
          <Input id="city" name="city" maxLength={80} placeholder="Niamey" />
        </FormField>
        <FormField label="Devise" htmlFor="currency" required>
          <NativeSelect id="currency" name="currency" defaultValue="XOF">
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Fuseau horaire" htmlFor="timezone" required>
          <NativeSelect id="timezone" name="timezone" defaultValue="Africa/Niamey">
            {TIMEZONES.map((timezone) => (
              <option key={timezone} value={timezone}>
                {timezone}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Langue" htmlFor="language" required>
          <NativeSelect id="language" name="language" defaultValue="fr">
            <option value="fr">Français</option>
            <option value="en">English (interface partiellement traduite)</option>
          </NativeSelect>
        </FormField>
      </div>
      <SubmitButton label="Créer l'organisation" pendingLabel="Création…" className="w-full sm:w-auto" />
    </form>
  );
}
