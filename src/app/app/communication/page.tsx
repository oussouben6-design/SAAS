import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/server/context";
import { ModuleComingSoon } from "@/components/shared/module-coming-soon";

export const metadata: Metadata = { title: "Communication" };

export default async function CommunicationPage() {
  await requirePagePermission("communication", "read");
  return (
    <ModuleComingSoon
      title="Communication interne"
      description="Annonces internes, calendrier partagé et événements."
      permissionModule="communication"
      tables={["announcements", "calendar_events"]}
      features={[
        "Publication d'annonces internes ciblées",
        "Calendrier partagé et événements",
        "Rappels et notifications",
        "Historique des communications",
      ]}
    />
  );
}
