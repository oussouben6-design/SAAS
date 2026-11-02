import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/server/context";
import { ModuleComingSoon } from "@/components/shared/module-coming-soon";

export const metadata: Metadata = { title: "Finances" };

export default async function FinancePage() {
  await requirePagePermission("finance", "read");
  return (
    <ModuleComingSoon
      title="Finances"
      description="Recettes, dépenses, devis, factures, paiements et rapports financiers."
      permissionModule="finance"
      tables={[
        "financial_categories",
        "revenues",
        "expenses",
        "quotes",
        "quote_items",
        "invoices",
        "invoice_items",
        "payments",
      ]}
      features={[
        "Enregistrement des recettes et dépenses par catégorie",
        "Devis et factures avec numérotation automatique",
        "Suivi des paiements et des impayés",
        "Génération PDF des documents financiers",
        "Rapports financiers par période",
      ]}
    />
  );
}
