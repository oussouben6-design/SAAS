import { Construction, Database, ShieldCheck } from "lucide-react";
import { PageHeader, Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Affichage honnête d'un module dont le schéma et la sécurité existent
 * mais dont l'interface métier n'est pas encore développée.
 */
export function ModuleComingSoon({
  title,
  description,
  features,
  tables,
  permissionModule,
}: {
  title: string;
  description: string;
  features: string[];
  tables: string[];
  permissionModule: string;
}) {
  return (
    <div className="space-y-5">
      <PageHeader
        title={title}
        description={description}
        badge={<Badge variant="warning">En développement</Badge>}
      />

      <Alert variant="warning" title="Ce module n'est pas encore utilisable">
        Les tables et politiques de sécurité existent, mais aucune interface métier n&apos;est disponible.
        Aucune donnée de démonstration n&apos;est affichée. Les fonctionnalités listées ci-dessous ne doivent
        pas être considérées comme opérationnelles.
      </Alert>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Construction className="size-4" /> Fonctionnalités prévues
            </CardTitle>
            <CardDescription>Périmètre planifié, non encore livré.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
              {features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="size-4" /> État technique réel
            </CardTitle>
            <CardDescription>Ce qui est déjà en place dans la base de données.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">Tables créées et protégées par RLS :</p>
            <ul className="flex flex-wrap gap-1.5">
              {tables.map((table) => (
                <li key={table}>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{table}</code>
                </li>
              ))}
            </ul>
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
              Accès conditionné à la permission <code>{permissionModule}:read</code> (ou plus restrictive).
              Aucune interface ne contourne cette règle.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
