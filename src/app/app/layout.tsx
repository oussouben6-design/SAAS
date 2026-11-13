import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getAppContext, listMemberships } from "@/lib/server/context";
import { NAVIGATION } from "@/lib/navigation";
import { asMember } from "@/lib/db";
import { listModules } from "@/modules/organization/service";
import { can } from "@/lib/server/context";
import type { ModuleKey } from "@/lib/permissions/catalog";

/**
 * Espace client : jamais indexé (données d'organisation, aucun contenu public).
 * `robots.txt` l'exclut déjà ; ce `noindex` évite qu'une URL partagée soit mise en cache par un
 * moteur. Aucun impact sur l'application : la balise est lue par les robots, pas exécutée.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const context = await getAppContext();
  if (!context) redirect("/connexion");
  if (!context.organization || !context.member) redirect("/onboarding");

  const [memberships, modules, unread] = await Promise.all([
    listMemberships(context.user.id),
    listModules({ userId: context.user.id, organizationId: context.organization.id }),
    asMember(
      { userId: context.user.id, organizationId: context.organization.id },
      (tx) =>
        tx.query<{ count: number }>(
          "select count(*)::int as count from notifications where user_id = $1 and read_at is null",
          [context.user.id],
        ),
    ),
  ]);

  const enabledModules = modules.filter((entry) => entry.enabled).map((entry) => entry.moduleKey);

  const navigation = NAVIGATION.map((section) => ({
    label: section.label,
    items: section.items.map((item) => ({
      ...item,
      allowed: can(context, item.moduleKey, item.action ?? "read"),
    })),
  })).filter((section) => section.items.some((item) => item.allowed));

  const roleLabel =
    context.member.roleKeys
      .map((key) =>
        key === "owner"
          ? "Administrateur principal"
          : key === "director"
            ? "Directeur"
            : key === "department_manager"
              ? "Responsable"
              : key === "manager"
                ? "Gestionnaire"
                : key === "employee"
                  ? "Employé"
                  : "Lecteur",
      )[0] ?? "Collaborateur";

  return (
    <AppShell
      user={{
        id: context.user.id,
        fullName: context.user.fullName,
        email: context.user.email,
        avatarUrl: context.user.avatarUrl,
        roleLabel,
      }}
      unreadNotifications={unread[0]?.count ?? 0}
      demoMode={context.organization.isDemo}
      demoOrganizationName={context.organization.name}
      sidebar={{
        organizationName: context.organization.name,
        organizationId: context.organization.id,
        enabledModules: enabledModules as ModuleKey[],
        unreadNotifications: unread[0]?.count ?? 0,
        navigation,
        memberships: memberships.map((membership) => ({
          id: membership.organization_id,
          name: membership.name,
          slug: membership.slug,
        })),
      }}
    >
      {children}
    </AppShell>
  );
}
