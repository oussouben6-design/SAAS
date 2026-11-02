"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, LogOut, Menu, Search, Settings, UserRound, X } from "lucide-react";
import { SidebarContent, type SidebarProps } from "./sidebar";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/misc";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logoutAction } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";

export interface ShellUser {
  id: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  roleLabel: string;
}

export function AppShell({
  children,
  sidebar,
  user,
  unreadNotifications,
  demoMode = false,
  demoOrganizationName,
}: {
  children: React.ReactNode;
  sidebar: Omit<SidebarProps, "compact" | "onNavigate">;
  user: ShellUser;
  unreadNotifications: number;
  /** Organisation de démonstration : bandeau permanent, données fictives. */
  demoMode?: boolean;
  demoOrganizationName?: string;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const pathname = usePathname();

  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-dvh bg-background">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 lg:block">
        <SidebarContent {...sidebar} unreadNotifications={unreadNotifications} />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/50"
            onClick={() => setMobileOpen(false)}
            aria-label="Fermer le menu"
          />
          <div className="relative h-full w-72 max-w-[85vw] shadow-2xl">
            <SidebarContent
              {...sidebar}
              unreadNotifications={unreadNotifications}
              onNavigate={() => setMobileOpen(false)}
            />
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-2 top-2 rounded-md p-1.5 text-sidebar-muted hover:bg-white/10"
              aria-label="Fermer"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card/85 px-4 backdrop-blur sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Ouvrir le menu"
          >
            <Menu />
          </Button>

          <form action="/app/recherche" className="relative min-w-0 flex-1 max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              name="q"
              placeholder="Rechercher un client, un projet, une tâche…"
              className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground/70 focus:border-ring focus:bg-card"
              aria-label="Recherche globale"
            />
          </form>

          <div className="ml-auto flex items-center gap-1.5">
            <Link
              href="/app/notifications"
              className="relative inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={`Notifications${unreadNotifications > 0 ? ` (${unreadNotifications} non lues)` : ""}`}
            >
              <Bell className="size-4" />
              {unreadNotifications > 0 ? (
                <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-danger text-[10px] font-semibold text-white">
                  {unreadNotifications > 9 ? "9+" : unreadNotifications}
                </span>
              ) : null}
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-muted"
                  aria-label="Menu du profil"
                >
                  <Avatar name={user.fullName} src={user.avatarUrl} className="size-8" />
                  <span className="hidden min-w-0 text-left sm:block">
                    <span className="block max-w-[10rem] truncate text-sm font-medium leading-tight">
                      {user.fullName}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">{user.roleLabel}</span>
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56">
                <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/app/parametres/profil">
                    <UserRound /> Mon profil
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/app/parametres/organisation">
                    <Settings /> Paramètres
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <form action={logoutAction}>
                  <DropdownMenuItem asChild>
                    <button type="submit" className="w-full">
                      <LogOut /> Se déconnecter
                    </button>
                  </DropdownMenuItem>
                </form>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {demoMode ? (
          <div
            role="status"
            className="border-b border-warning/30 bg-warning-soft px-4 py-2 text-center text-xs font-medium text-warning sm:px-6"
          >
            Espace de démonstration{demoOrganizationName ? ` — « ${demoOrganizationName} »` : ""} :
            toutes les données affichées sont fictives et peuvent être supprimées avec{" "}
            <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-[11px]">npm run db:reset</code>.
          </div>
        ) : null}

        <main className={cn("mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8")}>
          {children}
        </main>
      </div>
    </div>
  );
}
