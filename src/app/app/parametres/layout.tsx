import { redirect } from "next/navigation";
import { getAppContext } from "@/lib/server/context";
import { PageHeader } from "@/components/ui/misc";
import { SettingsNav } from "./settings-nav";

const TABS = [
  { href: "/app/parametres/organisation", label: "Organisation" },
  { href: "/app/parametres/equipe", label: "Équipe" },
  { href: "/app/parametres/roles", label: "Rôles & permissions" },
  { href: "/app/parametres/modules", label: "Modules" },
  { href: "/app/parametres/profil", label: "Mon profil" },
  { href: "/app/parametres/securite", label: "Sécurité" },
];

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const context = await getAppContext();
  if (!context) redirect("/connexion");
  if (!context.organization) redirect("/onboarding");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Paramètres"
        description="Configurez votre organisation, vos collaborateurs et vos droits d'accès."
      />
      <SettingsNav tabs={TABS} />
      {children}
    </div>
  );
}
