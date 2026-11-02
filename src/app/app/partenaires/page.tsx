import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/server/context";
import { ModuleComingSoon } from "@/components/shared/module-coming-soon";

export const metadata: Metadata = { title: "Partenaires" };

export default async function PartnersPage() {
  await requirePagePermission("partners", "read");
  return (
    <ModuleComingSoon
      title="Partenaires"
      description="Fournisseurs, institutions, conventions et contrats de partenariat."
      permissionModule="partners"
      tables={["partners", "partner_contacts", "partner_agreements"]}
      features={[
        "Fiches partenaires et contacts",
        "Conventions et contrats avec échéances",
        "Documents associés",
        "Historique des collaborations",
      ]}
    />
  );
}
