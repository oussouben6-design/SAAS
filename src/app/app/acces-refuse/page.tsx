import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { requireContext } from "@/lib/server/context";
import { MODULE_LABELS, type ModuleKey } from "@/lib/permissions/catalog";
import { ACTION_LABELS } from "@/lib/permissions/catalog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Accès refusé" };

const ROLE_LABELS: Record<string, string> = {
  owner: "Administrateur principal",
  director: "Directeur",
  department_manager: "Responsable de département",
  manager: "Gestionnaire",
  employee: "Employé",
  reader: "Lecteur",
};

/**
 * Page d'explication affichée lorsqu'un rôle tente d'ouvrir un module sans permission.
 * Aucune donnée métier n'est chargée ici : la vérification a lieu avant l'accès aux données.
 */
export default async function AccessDeniedPage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string; action?: string }>;
}) {
  const context = await requireContext();
  const params = await searchParams;
  const moduleKey = params.module as ModuleKey | undefined;
  const moduleLabel =
    moduleKey && moduleKey in MODULE_LABELS ? MODULE_LABELS[moduleKey] : "ce module";
  const action = params.action as keyof typeof ACTION_LABELS | undefined;
  const actionLabel = action && action in ACTION_LABELS ? ACTION_LABELS[action].toLowerCase() : "consulter";
  const roles = context.member?.roleKeys.map((key) => ROLE_LABELS[key] ?? key) ?? [];

  return (
    <div className="mx-auto max-w-2xl py-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-warning" /> Accès refusé
          </CardTitle>
          <CardDescription>
            Votre rôle ne dispose pas de la permission nécessaire pour {actionLabel} «{" "}
            {moduleLabel} ».
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Module demandé</dt>
              <dd className="font-medium">{moduleLabel}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Action demandée</dt>
              <dd className="font-medium">{actionLabel}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Votre rôle</dt>
              <dd className="font-medium">{roles.join(", ") || "Collaborateur"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Organisation</dt>
              <dd className="font-medium">{context.organization?.name ?? "—"}</dd>
            </div>
          </dl>

          <p className="text-muted-foreground">
            Cette restriction est appliquée côté serveur : les données du module ne sont pas
            chargées et les actions correspondantes sont refusées. Si cet accès est nécessaire à
            votre mission, demandez à un administrateur principal d&apos;ajuster les permissions de
            votre rôle.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/app">Retour au tableau de bord</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/app/parametres/profil">Mon profil</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
