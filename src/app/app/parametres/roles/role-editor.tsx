"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { updateRolePermissionsAction } from "@/modules/organization/actions";
import { ACTION_LABELS, MODULE_LABELS, type PermissionAction } from "@/lib/permissions/catalog";

export interface CatalogModule {
  module: string;
  label: string;
  actions: { action: PermissionAction; label: string }[];
}

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={disabled || pending} loading={pending}>
      <Save /> Enregistrer
    </Button>
  );
}

export function RoleEditor({
  roleId,
  roleName,
  roleKey,
  description,
  isSystem,
  membersCount,
  permissionKeys,
  catalog,
  editable,
}: {
  roleId: string;
  roleName: string;
  roleKey: string;
  description: string | null;
  isSystem: boolean;
  membersCount: number;
  permissionKeys: string[];
  catalog: CatalogModule[];
  editable: boolean;
}) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set(permissionKeys));
  const [state, formAction] = useActionState(updateRolePermissionsAction, null);
  const locked = roleKey === "owner";

  React.useEffect(() => {
    if (!state) return;
    if (state.ok) toast.success(state.message ?? "Permissions enregistrées.");
    else toast.error(state.message);
  }, [state]);

  const toggle = (key: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleModule = (module: CatalogModule) => {
    const keys = module.actions.map((entry) => `${module.module}:${entry.action}`);
    const allSelected = keys.every((key) => selected.has(key));
    setSelected((current) => {
      const next = new Set(current);
      for (const key of keys) {
        if (allSelected) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  };

  return (
    <details className="card-surface overflow-hidden">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3">
        <span className="font-semibold">{roleName}</span>
        {isSystem ? <Badge variant="outline">Système</Badge> : null}
        {locked ? <Badge variant="primary">Accès complet verrouillé</Badge> : null}
        <span className="text-xs text-muted-foreground">
          {membersCount} collaborateur(s) · {permissionKeys.length} permission(s)
        </span>
      </summary>
      <div className="space-y-4 border-t border-border px-4 py-4">
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="roleId" value={roleId} />
          <div className="space-y-3">
            {catalog.map((module) => (
              <div key={module.module} className="rounded-lg border border-border p-2.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-sm font-medium">{module.label}</p>
                  {editable && !locked ? (
                    <button
                      type="button"
                      onClick={() => toggleModule(module)}
                      className="text-xs text-primary hover:underline"
                    >
                      Tout / rien
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-3">
                  {module.actions.map((entry) => {
                    const key = `${module.module}:${entry.action}`;
                    const checked = locked ? true : selected.has(key);
                    return (
                      <label key={key} className="flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          name="permissions"
                          value={key}
                          checked={checked}
                          disabled={!editable || locked}
                          onChange={() => toggle(key)}
                          className="size-3.5 rounded border-input"
                        />
                        {entry.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {editable && !locked ? <Submit disabled={false} /> : null}
          {locked ? (
            <p className="text-xs text-muted-foreground">
              Le rôle propriétaire conserve toutes les permissions par conception.
            </p>
          ) : null}
        </form>
      </div>
    </details>
  );
}

export function buildCatalog(): CatalogModule[] {
  return Object.entries(MODULE_LABELS).map(([module, label]) => ({
    module,
    label,
    actions: [],
  }));
}

export { ACTION_LABELS };
