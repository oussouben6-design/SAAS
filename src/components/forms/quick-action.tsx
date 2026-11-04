"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/server/action";

function IconSubmit({ label }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending} aria-label={label ?? "Exécuter"}>
      {pending ? <Loader2 className="animate-spin" /> : (label ?? "OK")}
    </Button>
  );
}

/**
 * Formulaire d'action rapide : envoie des champs cachés à une Server Action
 * et affiche un retour utilisateur (succès ou échec).
 */
export function QuickActionForm({
  action,
  fields,
  children,
  submitLabel,
  successMessage,
  className,
}: {
  action: (
    state: ActionResult<unknown> | null,
    formData: FormData,
  ) => Promise<ActionResult<unknown>>;
  fields: Record<string, string>;
  children?: React.ReactNode;
  submitLabel: string;
  successMessage?: string;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, null);

  React.useEffect(() => {
    if (!state) return;
    if (state.ok) toast.success(successMessage ?? state.message ?? "Opération effectuée.");
    else toast.error(state.message);
  }, [state, successMessage]);

  return (
    <form action={formAction} className={className}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="flex items-end gap-1.5">
        {children}
        <IconSubmit label={submitLabel} />
      </div>
    </form>
  );
}

/** Bouton d'action rapide (sans champ de formulaire). */
export function QuickActionButton({
  action,
  fields,
  label,
  successMessage,
  variant = "outline",
  icon,
}: {
  action: (
    state: ActionResult<unknown> | null,
    formData: FormData,
  ) => Promise<ActionResult<unknown>>;
  fields: Record<string, string>;
  label: string;
  successMessage?: string;
  variant?: "default" | "outline" | "ghost" | "secondary" | "destructive";
  icon?: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, null);

  React.useEffect(() => {
    if (!state) return;
    if (state.ok) toast.success(successMessage ?? state.message ?? "Opération effectuée.");
    else toast.error(state.message);
  }, [state, successMessage]);

  return (
    <form action={formAction}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button type="submit" size="sm" variant={variant}>
        {icon}
        {label}
      </Button>
    </form>
  );
}
