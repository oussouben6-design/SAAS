/**
 * Référentiel des permissions — miroir TypeScript du catalogue SQL (0006_permissions_catalog.sql).
 * Le catalogue SQL fait foi en base ; cette constante sert aux tests et à l'interface.
 */

export const ACTIONS = [
  "read",
  "create",
  "update",
  "delete",
  "validate",
  "export",
  "administer",
] as const;

export type PermissionAction = (typeof ACTIONS)[number];

export const MODULE_ACTIONS = {
  dashboard: ["read"],
  organization: ["read", "update", "administer"],
  members: ["read", "create", "update", "delete", "administer"],
  roles: ["read", "update", "administer"],
  crm: ["read", "create", "update", "delete", "export"],
  prospection: ["read", "create", "update", "delete", "export"],
  projects: ["read", "create", "update", "delete", "export"],
  tasks: ["read", "create", "update", "delete", "export"],
  documents: ["read", "create", "update", "delete"],
  hr: ["read", "create", "update", "delete", "validate", "export"],
  finance: ["read", "create", "update", "delete", "validate", "export"],
  partners: ["read", "create", "update", "delete", "export"],
  communication: ["read", "create", "update", "delete"],
  reports: ["read", "export"],
  audit: ["read"],
  ai: ["read"],
} as const satisfies Record<string, readonly PermissionAction[]>;

export type ModuleKey = keyof typeof MODULE_ACTIONS;

export interface PermissionDescriptor {
  module: ModuleKey;
  action: PermissionAction;
  description: string;
}

export const MODULE_LABELS: Record<ModuleKey, string> = {
  dashboard: "Tableau de bord",
  organization: "Organisation",
  members: "Collaborateurs",
  roles: "Rôles & permissions",
  crm: "Clients (CRM)",
  prospection: "Prospection",
  projects: "Projets",
  tasks: "Tâches",
  documents: "Documents",
  hr: "Ressources humaines",
  finance: "Finances",
  partners: "Partenaires",
  communication: "Communication",
  reports: "Rapports",
  audit: "Journal d'audit",
  ai: "Assistant IA",
};

export const ACTION_LABELS: Record<PermissionAction, string> = {
  read: "Lire",
  create: "Créer",
  update: "Modifier",
  delete: "Supprimer",
  validate: "Valider",
  export: "Exporter",
  administer: "Administrer",
};

export function permissionKey(module: ModuleKey, action: PermissionAction): string {
  return `${module}:${action}`;
}

export function isValidPermission(module: string, action: string): module is ModuleKey {
  return (
    module in MODULE_ACTIONS &&
    (MODULE_ACTIONS[module as ModuleKey] as readonly string[]).includes(action)
  );
}
