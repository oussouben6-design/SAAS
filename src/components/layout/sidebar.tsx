"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BadgeEuro,
  Bell,
  Bot,
  Building2,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  FileText,
  FolderKanban,
  Gauge,
  Handshake,
  LayoutDashboard,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
  UsersRound,
} from "lucide-react";
import type { NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { ModuleKey } from "@/lib/permissions/catalog";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "/app": LayoutDashboard,
  "/app/rapports": Gauge,
  "/app/clients": Users,
  "/app/prospection": Activity,
  "/app/projets": FolderKanban,
  "/app/taches": ClipboardList,
  "/app/documents": FileText,
  "/app/rh": UsersRound,
  "/app/finances": BadgeEuro,
  "/app/partenaires": Handshake,
  "/app/communication": CalendarDays,
  "/app/parametres/organisation": Settings,
  "/app/journal": ScrollText,
  "/app/assistant": Bot,
};

export interface SidebarProps {
  organizationName: string;
  organizationId: string;
  enabledModules: ModuleKey[];
  memberships: { id: string; name: string; slug: string }[];
  navigation: { label: string; items: (NavItem & { allowed: boolean })[] }[];
  unreadNotifications: number;
  onNavigate?: () => void;
  compact?: boolean;
}

export function SidebarContent({
  organizationName,
  memberships,
  navigation,
  enabledModules,
  unreadNotifications,
  onNavigate,
}: Omit<SidebarProps, "compact">) {
  const pathname = usePathname();
  const [orgOpen, setOrgOpen] = React.useState(false);

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <span className="inline-flex size-9 items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground">
          O
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wider text-sidebar-muted">ORGANIX</p>
          <button
            type="button"
            onClick={() => setOrgOpen((value) => !value)}
            className="flex max-w-full items-center gap-1 text-sm font-semibold hover:text-white"
            aria-expanded={orgOpen}
          >
            <span className="truncate">{organizationName}</span>
            <ChevronDown className="size-3.5 shrink-0 text-sidebar-muted" />
          </button>
        </div>
      </div>

      {orgOpen ? (
        <div className="mx-3 mb-2 rounded-lg border border-white/10 bg-white/5 p-1.5">
          {memberships.map((membership) => (
            <form key={membership.id} action="/api/organisations/activer" method="post">
              <input type="hidden" name="organizationId" value={membership.id} />
              <button
                type="submit"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-white/10"
              >
                <Building2 className="size-3.5" />
                <span className="truncate">{membership.name}</span>
              </button>
            </form>
          ))}
          <Link
            href="/onboarding"
            onClick={onNavigate}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-sidebar-muted hover:bg-white/10"
          >
            + Créer une organisation
          </Link>
        </div>
      ) : null}

      <nav className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {navigation.map((section) => (
          <div key={section.label}>
            <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = ICONS[item.href] ?? LayoutDashboard;
                const active =
                  pathname === item.href ||
                  (item.href !== "/app" && pathname.startsWith(`${item.href}/`));
                const moduleEnabled = enabledModules.includes(item.moduleKey);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "group flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors",
                        active
                          ? "bg-white/10 font-medium text-white"
                          : "text-sidebar-muted hover:bg-white/5 hover:text-white",
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.status === "development" ? (
                        <span className="rounded bg-white/10 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-sidebar-muted">
                          Dev
                        </span>
                      ) : null}
                      {!moduleEnabled ? (
                        <span className="rounded bg-white/10 px-1 py-0.5 text-[9px] uppercase text-sidebar-muted">
                          Off
                        </span>
                      ) : null}
                      {item.href === "/app/notifications" && unreadNotifications > 0 ? (
                        <Badge variant="danger">{unreadNotifications}</Badge>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
            {section.label === "Pilotage" ? (
              <Link
                href="/app/notifications"
                onClick={onNavigate}
                className="mt-1 flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-sidebar-muted transition-colors hover:bg-white/5 hover:text-white"
              >
                <Bell className="size-4" />
                <span className="flex-1">Notifications</span>
                {unreadNotifications > 0 ? (
                  <span className="rounded-full bg-danger px-1.5 text-[10px] font-semibold text-white">
                    {unreadNotifications}
                  </span>
                ) : null}
              </Link>
            ) : null}
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 px-4 py-3 text-[11px] text-sidebar-muted">
        <p className="flex items-center gap-1.5">
          <ShieldCheck className="size-3.5" /> Session sécurisée · RLS active
        </p>
        <p className="mt-1 opacity-70">ORGANIX v0.1 — pilote</p>
      </div>
    </div>
  );
}
