import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/server/context";
import { ModuleComingSoon } from "@/components/shared/module-coming-soon";

export const metadata: Metadata = { title: "Ressources humaines" };

export default async function HrPage() {
  await requirePagePermission("hr", "read");
  return (
    <ModuleComingSoon
      title="Ressources humaines"
      description="Dossiers employés, contrats, congés, présences et historique administratif."
      permissionModule="hr"
      tables={[
        "employees",
        "employee_contracts",
        "leave_requests",
        "attendance_records",
      ]}
      features={[
        "Dossiers employés et rattachement aux départements",
        "Contrats et documents RH (accès restreint)",
        "Demandes et validation de congés",
        "Suivi des présences",
        "Historique administratif et audit",
      ]}
    />
  );
}
