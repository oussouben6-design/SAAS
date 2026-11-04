"use client";

import * as React from "react";
import { useActionState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormFeedback, SubmitButton, type FormAction } from "./form-dialog";

/**
 * Confirmation d'une action destructive : le formulaire envoie les champs cachés
 * (identifiants) à la Server Action, qui revérifie les permissions côté serveur.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Confirmer",
  action,
  fields,
  successMessage,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  confirmLabel?: string;
  action: FormAction;
  fields: Record<string, string>;
  successMessage?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [state, formAction] = useActionState(action, null);

  React.useEffect(() => {
    if (state?.ok) {
      toast.success(successMessage ?? state.message ?? "Opération effectuée.");
      setOpen(false);
    }
  }, [state, successMessage]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <form action={formAction}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <DialogBody>
            <FormFeedback state={state} />
            {Object.entries(fields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <SubmitButton label={confirmLabel} pendingLabel="Suppression…" variant="destructive" />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
