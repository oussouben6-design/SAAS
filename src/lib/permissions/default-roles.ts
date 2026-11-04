import {
  MODULE_ACTIONS,
  type ModuleKey,
  type PermissionAction,
  permissionKey,
} from "./catalog";

export type RoleKey =
  | "owner"
  | "director"
  | "department_manager"
  | "manager"
  | "employee"
  | "reader";

export interface RoleDefinition {
  key: RoleKey;
  name: string;
  description: string;
  rank: number;
  /** `*` accorde toutes les permissions du catalogue. */
  grants: "*" | Partial<Record<ModuleKey, PermissionAction[]>>;
}

const READ_ALL_MODULES = Object.keys(MODULE_ACTIONS) as ModuleKey[];

function readAll(except: ModuleKey[] = []): Partial<Record<ModuleKey, PermissionAction[]>> {
  return Object.fromEntries(
    READ_ALL_MODULES.filter((module) => !except.includes(module)).map((module) => [module, ["read"]]),
  ) as Partial<Record<ModuleKey, PermissionAction[]>>;
}

export const DEFAULT_ROLES: RoleDefinition[] = [
  {
    key: "owner",
    name: "Administrateur principal",
    description: "Accès complet, y compris l'administration des rôles et de l'organisation.",
    rank: 10,
    grants: "*",
  },
  {
    key: "director",
    name: "Directeur",
    description:
      "Pilotage global : accès en lecture à tous les modules, création et validation opérationnelles.",
    rank: 20,
    grants: {
      ...readAll(["ai"]),
      ai: ["read"],
      organization: ["read", "update"],
      members: ["read", "create", "update"],
      crm: ["read", "create", "update", "export"],
      prospection: ["read", "create", "update", "export"],
      projects: ["read", "create", "update", "export"],
      tasks: ["read", "create", "update", "export"],
      documents: ["read", "create", "update"],
      hr: ["read", "create", "update", "validate", "export"],
      finance: ["read", "create", "update", "validate", "export"],
      partners: ["read", "create", "update", "export"],
      communication: ["read", "create", "update", "delete"],
      reports: ["read", "export"],
    },
  },
  {
    key: "department_manager",
    name: "Responsable de département",
    description: "Gestion opérationnelle de son périmètre et validation des demandes de son équipe.",
    rank: 30,
    grants: {
      ...readAll(["audit", "roles", "finance", "ai"]),
      finance: ["read"],
      members: ["read"],
      roles: ["read"],
      crm: ["read", "create", "update", "export"],
      prospection: ["read", "create", "update", "export"],
      projects: ["read", "create", "update", "export"],
      tasks: ["read", "create", "update", "export"],
      documents: ["read", "create", "update"],
      hr: ["read", "create", "update", "validate"],
      partners: ["read", "create", "update", "export"],
      communication: ["read", "create", "update"],
      reports: ["read", "export"],
    },
  },
  {
    key: "manager",
    name: "Gestionnaire",
    description: "Gestion quotidienne du CRM, des projets, des tâches et des documents.",
    rank: 40,
    grants: {
      dashboard: ["read"],
      organization: ["read"],
      members: ["read"],
      roles: ["read"],
      crm: ["read", "create", "update", "export"],
      prospection: ["read", "create", "update", "export"],
      projects: ["read", "create", "update", "export"],
      tasks: ["read", "create", "update", "export"],
      documents: ["read", "create", "update"],
      hr: ["read"],
      partners: ["read", "create", "update", "export"],
      communication: ["read", "create"],
      reports: ["read", "export"],
    },
  },
  {
    key: "employee",
    name: "Employé",
    description: "Accès à ses projets, ses tâches et aux documents partagés.",
    rank: 50,
    grants: {
      dashboard: ["read"],
      organization: ["read"],
      members: ["read"],
      projects: ["read"],
      tasks: ["read", "create", "update"],
      documents: ["read", "create"],
      communication: ["read"],
      reports: ["read"],
    },
  },
  {
    key: "reader",
    name: "Lecteur",
    description: "Consultation seule des projets, tâches et documents.",
    rank: 60,
    grants: {
      dashboard: ["read"],
      organization: ["read"],
      members: ["read"],
      projects: ["read"],
      tasks: ["read"],
      documents: ["read"],
      communication: ["read"],
      reports: ["read"],
    },
  },
];

export function expandGrants(role: RoleDefinition): Set<string> {
  if (role.grants === "*") {
    return new Set(
      (Object.entries(MODULE_ACTIONS) as [ModuleKey, readonly PermissionAction[]][]).flatMap(
        ([module, actions]) => actions.map((action) => permissionKey(module, action)),
      ),
    );
  }
  return new Set(
    Object.entries(role.grants).flatMap(([module, actions]) =>
      (actions ?? []).map((action) => permissionKey(module as ModuleKey, action)),
    ),
  );
}

export const ROLE_KEYS = DEFAULT_ROLES.map((role) => role.key);
