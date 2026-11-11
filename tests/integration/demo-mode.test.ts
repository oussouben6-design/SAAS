import { describe, expect, it } from "vitest";
import {
  createUserAccount,
  enterDemoMode,
  validateSession,
} from "@/lib/auth/service";
import { createOrganization } from "@/modules/organization/service";
import { privileged } from "@/lib/db";

const PASSWORD = "MotDePasseSolide2026";
const META = { ip: "127.0.0.1", userAgent: "vitest" };

describe("mode démo public (bouton « Explorer la démo »)", () => {
  it("ouvre une session valide sur une organisation fictive, sans compte ni mot de passe", async () => {
    const result = await enterDemoMode(META);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const session = await validateSession(result.data.token);
    expect(session?.user.id).toBe(result.data.user.id);
    expect(session?.user.email).toBe("demo.visiteur@organix.local");

    // L'organisation est marquée is_demo (bandeau permanent, données fictives).
    const orgs = await privileged((tx) =>
      tx.query<{ is_demo: boolean }>("select is_demo from organizations", []),
    );
    expect(orgs.length).toBeGreaterThanOrEqual(1);
    expect(orgs.some((org) => org.is_demo)).toBe(true);

    // Appartenances : uniquement l'organisation de démo, en propriétaire.
    const memberships = await privileged((tx) =>
      tx.query<{ organization_id: string; is_owner: boolean }>(
        `select m.organization_id, m.is_owner
           from organization_members m
          where m.user_id = $1`,
        [result.data.user.id],
      ),
    );
    expect(memberships.length).toBeGreaterThanOrEqual(1);
    expect(memberships.every((membership) => membership.is_owner)).toBe(true);

    // Aucun identifiant : la connexion par mot de passe est impossible pour ce profil.
    const credentials = await privileged((tx) =>
      tx.query("select 1 from user_credentials where user_id = $1", [result.data.user.id]),
    );
    expect(credentials.length).toBe(0);

    // L'organisation auto-créée contient un échantillon fictif (au moins 3 clients).
    const customers = await privileged((tx) =>
      tx.query<{ count: number }>(
        `select count(*)::int as count from customers c
           join organizations o on o.id = c.organization_id
          where o.is_demo = true`,
        [],
      ),
    );
    expect(customers[0]?.count ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("réutilise le même visiteur et la même organisation (idempotent)", async () => {
    const first = await enterDemoMode(META);
    const second = await enterDemoMode(META);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.data.user.id).toBe(first.data.user.id);

    const orgs = await privileged((tx) =>
      tx.query<{ count: number }>(
        "select count(*)::int as count from organizations where is_demo = true",
        [],
      ),
    );
    expect(orgs[0]?.count).toBe(1);
  });

  it("n'ouvre l'accès qu'à la démo, jamais aux organisations réelles", async () => {
    const real = await createUserAccount({
      email: "reel.demo-test@organix.test",
      fullName: "Compte Réel",
      password: PASSWORD,
      emailVerified: true,
    });
    expect(real.ok).toBe(true);
    if (!real.ok) return;
    const organization = await createOrganization({
      userId: real.data.user.id,
      userEmail: "reel.demo-test@organix.test",
      name: "Société Réelle SARL",
      currency: "XOF",
      timezone: "Africa/Niamey",
      language: "fr",
    });

    const demo = await enterDemoMode(META);
    expect(demo.ok).toBe(true);
    if (!demo.ok) return;

    const memberships = await privileged((tx) =>
      tx.query<{ organization_id: string }>(
        "select organization_id from organization_members where user_id = $1",
        [demo.data.user.id],
      ),
    );
    expect(memberships.map((membership) => membership.organization_id)).not.toContain(
      organization.organizationId,
    );
  });
});
