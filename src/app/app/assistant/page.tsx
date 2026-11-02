import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/server/context";
import { ModuleComingSoon } from "@/components/shared/module-coming-soon";
import { Alert } from "@/components/ui/misc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Assistant IA" };

export default async function AssistantPage() {
  await requirePagePermission("ai", "read");
  const configured = Boolean(process.env.OPENAI_API_KEY);

  return (
    <div className="space-y-5">
      <ModuleComingSoon
        title="Assistant IA"
        description="Intégration facultative à l'API OpenAI pour résumer et analyser les données autorisées."
        permissionModule="ai"
        tables={[]}
        features={[
          "Résumé des activités et des projets",
          "Analyse et synthèse des rapports",
          "Aide à la rédaction de comptes rendus",
          "Questions sur les données autorisées uniquement",
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle>État de la configuration</CardTitle>
          <CardDescription>Aucune requête n&apos;est envoyée à un fournisseur d&apos;IA.</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant={configured ? "info" : "warning"}>
            {configured
              ? "Une clé OPENAI_API_KEY est présente, mais l'intégration n'est pas encore développée : aucun appel n'est effectué et aucun coût n'est engagé."
              : "Aucune clé OPENAI_API_KEY n'est configurée. L'assistant restera inactif tant que l'intégration n'aura pas été développée et explicitement activée."}
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
