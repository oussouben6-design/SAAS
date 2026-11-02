import type { ModuleKey, PermissionAction } from "@/lib/permissions/catalog";

export interface NavItem {
  label: string;
  href: string;
  moduleKey: ModuleKey;
  action?: PermissionAction;
  status: "available" | "development";
  description: string;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAVIGATION: NavSection[] = [
  {
    label: "Pilotage",
    items: [
      {
        label: "Tableau de bord",
        href: "/app",
        moduleKey: "dashboard",
        status: "available",
        description: "Indicateurs consolidés de votre organisation.",
      },
      {
        label: "Rapports",
        href: "/app/rapports",
        moduleKey: "reports",
        status: "available",
        description: "Analyses par période et export CSV.",
      },
    ],
  },
  {
    label: "Commercial",
    items: [
      {
        label: "Clients",
        href: "/app/clients",
        moduleKey: "crm",
        status: "available",
        description: "Fiches clients, contacts et historique des échanges.",
      },
      {
        label: "Prospection",
        href: "/app/prospection",
        moduleKey: "prospection",
        status: "available",
        description: "Prospects, opportunités et pipeline commercial.",
      },
    ],
  },
  {
    label: "Opérations",
    items: [
      {
        label: "Projets",
        href: "/app/projets",
        moduleKey: "projects",
        status: "available",
        description: "Portefeuille de projets, jalons et avancement.",
      },
      {
        label: "Tâches",
        href: "/app/taches",
        moduleKey: "tasks",
        status: "available",
        description: "Suivi des tâches en liste, kanban et calendrier.",
      },
      {
        label: "Documents",
        href: "/app/documents",
        moduleKey: "documents",
        status: "available",
        description: "Classement, recherche et téléchargement sécurisé.",
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        label: "Ressources humaines",
        href: "/app/rh",
        moduleKey: "hr",
        status: "available",
        description: "Dossiers employés, contrats, congés et présences.",
      },
      {
        label: "Finances",
        href: "/app/finances",
        moduleKey: "finance",
        status: "available",
        description: "Recettes, dépenses, devis, factures et paiements.",
      },
      {
        label: "Partenaires",
        href: "/app/partenaires",
        moduleKey: "partners",
        status: "available",
        description: "Fournisseurs, institutions, conventions et contrats.",
      },
      {
        label: "Communication",
        href: "/app/communication",
        moduleKey: "communication",
        status: "available",
        description: "Annonces internes, calendrier partagé et événements.",
      },
    ],
  },
  {
    label: "Système",
    items: [
      {
        label: "Paramètres",
        href: "/app/parametres/organisation",
        moduleKey: "organization",
        status: "available",
        description: "Organisation, équipe, rôles et modules.",
      },
      {
        label: "Journal d'audit",
        href: "/app/journal",
        moduleKey: "audit",
        status: "available",
        description: "Traçabilité des actions sensibles.",
      },
      {
        label: "Assistant IA",
        href: "/app/assistant",
        moduleKey: "ai",
        status: "development",
        description: "Intégration facultative OpenAI, non configurée.",
      },
    ],
  },
];

export function findNavItem(pathname: string): NavItem | null {
  for (const section of NAVIGATION) {
    for (const item of section.items) {
      if (item.href === pathname) return item;
      if (item.href !== "/app" && pathname.startsWith(`${item.href}/`)) return item;
    }
  }
  return null;
}
