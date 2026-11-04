import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { requirePagePermission, can } from "@/lib/server/context";
import { listRoles } from "@/modules/organization/service";
import { PageHeader, Alert } from "@/components/ui/misc";
import { MODULE_ACTIONS, MODULE_LABELS, ACTION_LABELS } from "@/lib/permissions/catalog";
import { RoleEditor } from "./role-editor";
import type { CatalogModule } from "./role-editor";

export const metadata: Metadata = { title: "Rôles & permissions" };

export default async function RolesPage() {
  const context = await requirePagePermission("roles", "read");
  const roles = await listRoles({
    userId: context.user.id,
    organizationId: context.organization!.id,
  });
  const editable = can(context, "roles", "administer");

  const catalog: CatalogModule[] = Object.entries(MODULE_LABELS).map(([module, label]) => ({
    module,
    label,
    actions: (MODULE_ACTIONS[module as keyof typeof MODULE_ACTIONS] ?? []).map((action) => ({
      action,
      label: ACTION_LABELS[action],
    })),
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Rôles & permissions"
        description="Les permissions sont vérifiées côté serveur et dans la base (RLS). Modifier un rôle affecte immédiatement ses membres."
      />

      {!editable ? (
        <Alert variant="info">
          Vous pouvez consulter les rôles mais pas les modifier. Seul un administrateur disposant de
          « rôles : administrer » peut ajuster les permissions.
        </Alert>
      ) : (
        <Alert variant="warning" title="Principe de moindre privilège">
          Accordez uniquement les permissions nécessaires. Certaines données sensibles (RH, finances)
          sont en outre protégées par des politiques au niveau de la base.
        </Alert>
      )}

      <div className="space-y-3">
        {roles.map((role) => (
          <RoleEditor
            key={role.id}
            roleId={role.id}
            roleName={role.name}
            roleKey={role.key}
            description={role.description}
            isSystem={role.is_system}
            membersCount={role.members_count}
            permissionKeys={role.permission_keys}
            catalog={catalog}
            editable={editable}
          />
        ))}
      </div>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5" /> Toute modification de permissions est journalisée dans l&apos;audit.
      </p>
    </div>
  );
}
