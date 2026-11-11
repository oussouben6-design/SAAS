import { describe, expect, it } from "vitest";
import { privileged } from "@/lib/db";
import { ensurePersonalWorkspace, isPersonalMode, personalOwnerEmail } from "@/lib/personal";

describe("mode personnel (accès sans compte)", () => {
  it("est désactivé par défaut (aucune variable d'environnement)", () => {
    expect(isPersonalMode()).toBe(false);
  });

  it("provisionne un compte réel sans identifiant et un espace réel, idempotent", async () => {
    const email = personalOwnerEmail();
    const first = await ensurePersonalWorkspace();
    expect(first.user.email).toBe(email);

    // Aucun identifiant de connexion : ni mot de passe, ni identité Google.
    const credentials = await privileged((tx) =>
      tx.query("select 1 from user_credentials where user_id = $1", [first.user.id]),
    );
    expect(credentials.length).toBe(0);

    // L'organisation est réelle : is_demo = false, onboarding déjà validé, aucun contenu fictif.
    const organizations = await privileged((tx) =>
      tx.query<{ id: string; is_demo: boolean; onboarding_completed_at: string | null }>(
        `select o.id, o.is_demo, o.onboarding_completed_at
           from organizations o
           join organization_members m on m.organization_id = o.id
          where m.user_id = $1 and m.is_owner = true and o.deleted_at is null
          order by o.created_at asc`,
        [first.user.id],
      ),
    );
    expect(organizations.length).toBeGreaterThanOrEqual(1);
    const owned = organizations[0]!;
    expect(owned.is_demo).toBe(false);
    expect(owned.onboarding_completed_at).not.toBeNull();

    const customers = await privileged((tx) =>
      tx.query<{ count: number }>(
        "select count(*)::int as count from customers where organization_id = $1",
        [owned.id],
      ),
    );
    expect(customers[0]?.count).toBe(0);

    // Rôle propriétaire attribué (back-office complet sur l'espace).
    const roles = await privileged((tx) =>
      tx.query<{ key: string }>(
        `select r.key
           from member_roles mr
           join roles r on r.id = mr.role_id
           join organization_members m on m.id = mr.member_id
          where m.organization_id = $1 and m.user_id = $2`,
        [owned.id, first.user.id],
      ),
    );
    expect(roles.map((role) => role.key)).toContain("owner");

    // Idempotent : le second appel réutilise le même compte et la même organisation.
    const second = await ensurePersonalWorkspace();
    expect(second.user.id).toBe(first.user.id);
    const ownedAgain = await privileged((tx) =>
      tx.query<{ count: number }>(
        `select count(*)::int as count
           from organization_members m
           join organizations o on o.id = m.organization_id
          where m.user_id = $1 and o.is_demo = false and o.deleted_at is null and m.is_owner`,
        [first.user.id],
      ),
    );
    expect(ownedAgain[0]?.count).toBe(1);
  });
});
