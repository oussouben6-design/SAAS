import { describe, expect, it } from "vitest";
import { authenticate, createUserAccount, validateSession } from "@/lib/auth/service";
import { createOrganization } from "@/modules/organization/service";
import { privileged } from "@/lib/db";
import { MODULE_ACTIONS } from "@/lib/permissions/catalog";

/**
 * Parcours d'un compte réel (hors jeu de démonstration) :
 * inscription → connexion → organisation réelle → rôle propriétaire complet.
 */
describe("parcours d'un compte réel", () => {
  it("inscrit, connecte et crée une organisation réelle avec tous les droits du propriétaire", async () => {
    const email = `reel.${Date.now()}@exemple.com`;
    const password = "CompteReelTest2026!";

    const created = await createUserAccount({ email, fullName: "Amina Réelle", password });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const login = await authenticate({ email, password, ip: "127.0.0.1", userAgent: "vitest" });
    expect(login.ok).toBe(true);
    if (!login.ok) return;
    const session = await validateSession(login.data.token);
    expect(session?.user.email).toBe(email);

    const organization = await createOrganization({
      userId: created.data.user.id,
      userEmail: email,
      name: `Cabinet Réel ${Date.now()}`,
      country: "Niger",
      city: "Niamey",
      currency: "XOF",
      timezone: "Africa/Niamey",
      language: "fr",
    });

    const [state] = await privileged((tx) =>
      tx.query<{ is_demo: boolean; is_owner: boolean; status: string; role: string; permissions: number }>(
        `select o.is_demo,
                m.is_owner,
                m.status,
                r.key as role,
                (select count(*)::int from role_permissions rp where rp.role_id = r.id) as permissions
           from organizations o
           join organization_members m on m.organization_id = o.id
           join roles r on r.organization_id = o.id and r.key = 'owner'
          where o.id = $1 and m.user_id = $2`,
        [organization.organizationId, created.data.user.id],
      ),
    );

    const catalogSize = Object.values(MODULE_ACTIONS).reduce((total, actions) => total + actions.length, 0);
    expect(state?.is_demo).toBe(false);
    expect(state?.is_owner).toBe(true);
    expect(state?.status).toBe("active");
    expect(state?.role).toBe("owner");
    expect(state?.permissions).toBe(catalogSize);
    expect(organization.slug).toMatch(/^[a-z0-9-]+$/);
  });

  it("refuse un second compte avec la même adresse", async () => {
    const email = `doublon.${Date.now()}@exemple.com`;
    const first = await createUserAccount({ email, fullName: "Premier Compte", password: "CompteReelTest2026!" });
    expect(first.ok).toBe(true);

    const second = await createUserAccount({ email, fullName: "Second Compte", password: "CompteReelTest2026!" });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.code).toBe("email_taken");
  });
});
