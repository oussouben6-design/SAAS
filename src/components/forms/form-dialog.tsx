"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2 } from "lucide-react";
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
import type { ActionResult } from "@/lib/server/action";
import { cn } from "@/lib/utils";

export type FormAction = (
  state: ActionResult<unknown> | null,
  formData: FormData,
) => Promise<ActionResult<unknown>>;

export function SubmitButton({
  label,
  pendingLabel = "Enregistrement…",
  className,
  variant = "default",
}: {
  label: string;
  pendingLabel?: string;
  className?: string;
  variant?: "default" | "destructive" | "outline" | "secondary";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} className={cn(className)} variant={variant}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function FormFeedback({ state }: { state: ActionResult<unknown> | null }) {
  if (!state) return null;
  if (state.ok) {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-sm text-success">
        <CheckCircle2 className="size-4" /> {state.message ?? "Enregistré."}
      </p>
    );
  }
  const errors = state.fieldErrors ? Object.entries(state.fieldErrors) : [];
  return (
    <div className="space-y-1 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
      <p className="flex items-center gap-2 font-medium">
        <AlertCircle className="size-4" /> {state.message}
      </p>
      {errors.length > 0 ? (
        <ul className="list-inside list-disc pl-1 text-xs">
          {errors.map(([field, message]) => (
            <li key={field}>
              <span className="font-medium">{field}</span> : {message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function FormDialog({
  trigger,
  title,
  description,
  action,
  submitLabel,
  pendingLabel,
  children,
  className,
  successMessage,
  destructive = false,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  action: FormAction;
  submitLabel: string;
  pendingLabel?: string;
  children: React.ReactNode;
  className?: string;
  successMessage?: string;
  destructive?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [state, formAction] = useActionState(action, null);

  React.useEffect(() => {
    if (state?.ok) {
      toast.success(successMessage ?? state.message ?? "Enregistré avec succès.");
      setOpen(false);
    }
  }, [state, successMessage]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className={className}>
        <form action={formAction} className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <DialogBody>
            <FormFeedback state={state} />
            {children}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <SubmitButton
              label={submitLabel}
              pendingLabel={pendingLabel}
              variant={destructive ? "destructive" : "default"}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Formulaire inline (hors modale) avec retour d'état. */
export function InlineForm({
  action,
  children,
  submitLabel,
  className,
  successMessage,
  onSuccess,
}: {
  action: FormAction;
  children: React.ReactNode;
  submitLabel: string;
  className?: string;
  successMessage?: string;
  onSuccess?: () => void;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (state?.ok) {
      toast.success(successMessage ?? state.message ?? "Enregistré.");
      ref.current?.reset();
      onSuccess?.();
    }
  }, [state, successMessage, onSuccess]);

  return (
    <form ref={ref} action={formAction} className={cn("space-y-4", className)}>
      <FormFeedback state={state} />
      {children}
      <SubmitButton label={submitLabel} />
    </form>
  );
}
