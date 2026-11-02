import { createUserAccount } from "@/lib/auth/service";
import { createOrganization } from "@/modules/organization/service";
import { privileged } from "@/lib/db";

export interface TestActor {
  userId: string;
  email: string;
  password: string;
  organizationId: string;
  memberId: string;
}

let counter = 0;

export async function createTestActor(
  options: { name?: string; roleKey?: string; organizationName?: string } = {},
): Promise<TestActor> {
  counter += 1;
  const password = "MotDePasseTest2026";
  const email = `utilisateur${counter}-${Date.now()}@organix.test`;
  const created = await createUserAccount({
    email,
    fullName: options.name ?? `Utilisateur ${counter}`,
    password,
    emailVerified: true,
  });
  if (!created.ok) throw new Error(created.message);

  const organization = await createOrganization({
    userId: created.data.user.id,
    userEmail: email,
    name: options.organizationName ?? `Organisation ${counter}`,
    currency: "XOF",
    timezone: "Africa/Niamey",
    language: "fr",
  });

  const member = await privileged(async (tx) => {
    const rows = await tx.query<{ id: string }>(
      "select id from organization_members where organization_id = $1 and user_id = $2",
      [organization.organizationId, created.data.user.id],
    );
    return rows[0]!;
  });

  if (options.roleKey && options.roleKey !== "owner") {
    await privileged(async (tx) => {
      await tx.query("delete from member_roles where member_id = $1", [member.id]);
      await tx.query(
        `insert into member_roles (member_id, role_id)
         select $1, id from roles where organization_id = $2 and key = $3`,
        [member.id, organization.organizationId, options.roleKey],
      );
    });
  }

  return {
    userId: created.data.user.id,
    email,
    password,
    organizationId: organization.organizationId,
    memberId: member.id,
  };
}

export function contextOf(actor: TestActor) {
  return { userId: actor.userId, organizationId: actor.organizationId };
}

/** Ajoute un membre actif avec un rôle donné dans une organisation existante. */
export async function addMemberWithRole(
  organizationId: string,
  roleKey: string,
  options: { fullName?: string } = {},
): Promise<{ userId: string; email: string; password: string }> {
  const email = `membre-${roleKey}-${Date.now()}-${Math.round(Math.random() * 1e6)}@organix.test`;
  const password = "MotDePasseTest2026";
  const created = await createUserAccount({
    email,
    fullName: options.fullName ?? `Membre ${roleKey}`,
    password,
    emailVerified: true,
  });
  if (!created.ok) throw new Error(created.message);
  await privileged(async (tx) => {
    const member = await tx.query<{ id: string }>(
      `insert into organization_members (organization_id, user_id, status, joined_at)
       values ($1, $2, 'active', now()) returning id`,
      [organizationId, created.data.user.id],
    );
    await tx.query(
      `insert into member_roles (member_id, role_id)
       select $1, id from roles where organization_id = $2 and key = $3`,
      [member[0]!.id, organizationId, roleKey],
    );
  });
  return { userId: created.data.user.id, email, password };
}
