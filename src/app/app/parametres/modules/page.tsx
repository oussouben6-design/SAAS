import type { Metadata } from "next";
import { Layers, ToggleLeft, ToggleRight } from "lucide-react";
import { requirePagePermission, can } from "@/lib/server/context";
import { listModules } from "@/modules/organization/service";
import { PageHeader, Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QuickActionButton } from "@/components/forms/quick-action";
import { setModuleEnabledAction } from "@/modules/organization/actions";
import { MODULE_LABELS } from "@/lib/permissions/catalog";
import { NAVIGATION } from "@/lib/navigation";

export const metadata: Metadata = { title: "Modules" };

export default async function ModulesPage() {
  const context = await requirePagePermission("organization", "read");
  const modules = await listModules({
    userId: context.user.id,
    organizationId: context.organization!.id,
  });
  const editable = can(context, "organization", "administer");

  const statusByModule = new Map<string, "available" | "development">();
  for (const section of NAVIGATION) {
    for (const item of section.items) {
      statusByModule.set(item.moduleKey, item.status);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Modules"
        description="Activez uniquement les modules utiles à votre organisation. Les modules désactivés restent accessibles aux administrateurs."
      />

      <Alert variant="info" title="Modules en développement">
        Les modules signalés « En développement » disposent de leur schéma de base de données et de leurs
        politiques de sécurité, mais leur interface métier n&apos;est pas encore disponible. Ils sont
        explicitement identifiés pour éviter toute confusion.
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="size-4" /> Activation des modules
          </CardTitle>
          <CardDescription>{modules.filter((entry) => entry.enabled).length} module(s) actif(s)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {modules.map((entry) => {
            const status = statusByModule.get(entry.moduleKey) ?? "available";
            return (
              <div
                key={entry.moduleKey}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {MODULE_LABELS[entry.moduleKey]}
                    {status === "development" ? <Badge variant="warning">En développement</Badge> : null}
                    {entry.enabled ? <Badge variant="success">Actif</Badge> : <Badge>Désactivé</Badge>}
                  </p>
                </div>
                {editable ? (
                  <QuickActionButton
                    action={setModuleEnabledAction}
                    fields={{ moduleKey: entry.moduleKey, enabled: entry.enabled ? "false" : "true" }}
                    label={entry.enabled ? "Désactiver" : "Activer"}
                    variant="outline"
                    icon={entry.enabled ? <ToggleRight className="size-4" /> : <ToggleLeft className="size-4" />}
                    successMessage="Module mis à jour."
                  />
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
