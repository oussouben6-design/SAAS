import { describe, expect, it } from "vitest";
import { DEFAULT_ROLES, expandGrants } from "@/lib/permissions/default-roles";
import { MODULE_ACTIONS, permissionKey } from "@/lib/permissions/catalog";

describe("référentiel des permissions", () => {
  it("accorde toutes les permissions au rôle propriétaire", () => {
    const owner = DEFAULT_ROLES.find((role) => role.key === "owner")!;
    const grants = expandGrants(owner);
    const total = Object.values(MODULE_ACTIONS).reduce((sum, actions) => sum + actions.length, 0);
    expect(grants.size).toBe(total);
    expect(grants.has(permissionKey("roles", "administer"))).toBe(true);
  });

  it("n'accorde pas l'administration des rôles au directeur", () => {
    const director = DEFAULT_ROLES.find((role) => role.key === "director")!;
    const grants = expandGrants(director);
    expect(grants.has(permissionKey("roles", "administer"))).toBe(false);
    expect(grants.has(permissionKey("finance", "read"))).toBe(true);
    expect(grants.has(permissionKey("organization", "update"))).toBe(true);
  });

  it("limite le lecteur à la consultation", () => {
    const reader = DEFAULT_ROLES.find((role) => role.key === "reader")!;
    const grants = Array.from(expandGrants(reader));
    expect(grants.length).toBeGreaterThan(0);
    for (const grant of grants) {
      expect(grant.endsWith(":read")).toBe(true);
    }
    expect(grants).not.toContain(permissionKey("finance", "read"));
  });

  it("n'accorde aucune permission d'écriture à l'employé en dehors des tâches et documents", () => {
    const employee = DEFAULT_ROLES.find((role) => role.key === "employee")!;
    const grants = Array.from(expandGrants(employee));
    const writes = grants.filter((grant) => !grant.endsWith(":read"));
    expect(writes.every((grant) => grant.startsWith("tasks:") || grant.startsWith("documents:"))).toBe(true);
  });

  it("définit six rôles système", () => {
    expect(DEFAULT_ROLES.map((role) => role.key)).toEqual([
      "owner",
      "director",
      "department_manager",
      "manager",
      "employee",
      "reader",
    ]);
  });
});
