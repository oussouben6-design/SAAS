import { describe, expect, it } from "vitest";
import { createTestActor, contextOf } from "../helpers";
import {
  createProject,
  getProject,
  updateProject,
  addMilestone,
  toggleMilestone,
} from "@/modules/projects/service";
import { createTask, updateTaskStatus, getTask, addComment } from "@/modules/tasks/service";
import { convertLeadToCustomer, createLead, listLeads } from "@/modules/prospection/service";
import { inviteMember, getInvitation, acceptInvitation } from "@/modules/organization/invitations";
import {
  listMembers,
  updateMember,
  setMemberStatus,
  listRoles,
  createOrganization,
} from "@/modules/organization/service";
import { createUserAccount } from "@/lib/auth/service";
import { privileged } from "@/lib/db";
import { addDays, format } from "date-fns";

describe("projets et jalons", () => {
  it("crée un projet, refuse des dates incohérentes et suit les jalons", async () => {
    const actor = await createTestActor({ name: "Chef de projet" });
    const ctx = contextOf(actor);

    const projectId = await createProject(ctx, {
      name: "Déploiement ORGANIX",
      code: "DEP-01",
      description: null,
      objectives: "Mettre en production",
      customerId: null,
      departmentId: null,
      managerId: actor.userId,
      status: "active",
      priority: "high",
      startDate: "2026-01-10",
      endDate: "2026-06-30",
      budgetMinor: 5_000_000,
    });

    await expect(
      createProject(ctx, {
        name: "Projet invalide",
        code: null,
        description: null,
        objectives: null,
        customerId: null,
        departmentId: null,
        managerId: null,
        status: "planning",
        priority: "low",
        startDate: "2026-06-30",
        endDate: "2026-01-10",
        budgetMinor: 0,
      }),
    ).rejects.toThrow(/date de fin/i);

    await addMilestone(ctx, {
      projectId,
      title: "Recette utilisateurs",
      dueDate: "2026-04-01",
      description: null,
    });

    let detail = await getProject(ctx, projectId);
    expect(detail.milestones).toHaveLength(1);
    expect(detail.members.some((member) => member.user_id === actor.userId)).toBe(true);

    await toggleMilestone(ctx, detail.milestones[0]!.id);
    detail = await getProject(ctx, projectId);
    expect(detail.milestones[0]!.completed_at).not.toBeNull();

    await updateProject(ctx, {
      id: projectId,
      name: "Déploiement ORGANIX — phase 1",
      code: "DEP-01",
      description: null,
      objectives: null,
      customerId: null,
      departmentId: null,
      managerId: actor.userId,
      status: "active",
      priority: "critical",
      startDate: "2026-01-10",
      endDate: "2026-06-30",
      budgetMinor: 5_000_000,
      progress: 35,
    });
    detail = await getProject(ctx, projectId);
    expect(detail.project.progress).toBe(35);
  });
});

describe("tâches", () => {
  it("crée une tâche, la passe en terminée et journalise un commentaire", async () => {
    const actor = await createTestActor({ name: "Gestionnaire" });
    const ctx = contextOf(actor);

    const taskId = await createTask(ctx, {
      title: "Préparer le rapport mensuel",
      description: "Inclure les indicateurs financiers",
      projectId: null,
      parentTaskId: null,
      assigneeId: actor.userId,
      status: "todo",
      priority: "high",
      dueDate: format(addDays(new Date(), 3), "yyyy-MM-dd"),
    });

    await addComment(ctx, { taskId, body: "Je m'en occupe aujourd'hui." });
    await updateTaskStatus(ctx, { id: taskId, status: "done" });

    const detail = await getTask(ctx, taskId);
    expect(detail.task.status).toBe("done");
    expect(detail.task.completed_at).not.toBeNull();
    expect(detail.comments).toHaveLength(1);
    expect(detail.comments[0]!.body).toContain("aujourd'hui");
  });
});

describe("prospection", () => {
  it("convertit un prospect en client une seule fois", async () => {
    const actor = await createTestActor({ name: "Commercial" });
    const ctx = contextOf(actor);

    const leadId = await createLead(ctx, {
      name: "Fatou Sow",
      company: "Sahel Énergie",
      email: "fatou@sahel.test",
      phone: null,
      source: "referral",
      status: "qualified",
      notes: null,
      nextFollowUpAt: null,
      ownerId: actor.userId,
    });

    const { customerId } = await convertLeadToCustomer(ctx, leadId);
    expect(customerId).toBeTruthy();

    const leads = await listLeads(ctx, {});
    expect(leads[0]!.status).toBe("converted");
    expect(leads[0]!.converted_customer_id).toBe(customerId);

    await expect(convertLeadToCustomer(ctx, leadId)).rejects.toThrow(/déjà été converti/i);
  });
});

describe("gestion de l'équipe", () => {
  it("invite un collaborateur, accepte l'invitation et applique ses rôles", async () => {
    const owner = await createTestActor({ name: "Propriétaire", organizationName: "Delta Corp" });
    const ctx = contextOf(owner);

    const invitedEmail = `invite-${Date.now()}@organix.test`;
    const { mail } = await inviteMember(ctx, {
      email: invitedEmail,
      fullName: "Nouveau Collaborateur",
      roleKeys: ["manager"],
      departmentId: null,
      jobTitle: "Chargé de projet",
    });

    expect(mail.previewUrl).toBeTruthy();
    const token = mail.previewUrl!.split("/invitations/")[1]!;

    const invitation = await getInvitation(token);
    expect(invitation?.organizationName).toBe("Delta Corp");
    expect(invitation?.requiresPassword).toBe(true);

    const accepted = await acceptInvitation(token, {
      fullName: "Nouveau Collaborateur",
      password: "MotDePasseInvite2026",
    });

    const members = await listMembers(ctx);
    const invited = members.find((member) => member.email === invitedEmail);
    expect(invited?.status).toBe("active");
    expect(invited?.roles.map((role) => role.key)).toEqual(["manager"]);
    expect(accepted.userId).toBeTruthy();

    // L'invitation ne peut pas être rejouée.
    await expect(
      acceptInvitation(token, { fullName: "X", password: "MotDePasseInvite2026" }),
    ).rejects.toThrow();
  });

  it("empêche de suspendre le compte propriétaire", async () => {
    const owner = await createTestActor({ name: "Propriétaire 2" });
    const members = await listMembers(contextOf(owner));
    await expect(
      setMemberStatus(contextOf(owner), { memberId: members[0]!.id, status: "suspended" }),
    ).rejects.toThrow(/propriétaire/i);
  });

  it("interdit de réduire les permissions du rôle propriétaire", async () => {
    const owner = await createTestActor({ name: "Propriétaire 3" });
    const roles = await listRoles(contextOf(owner));
    const ownerRole = roles.find((role) => role.key === "owner")!;
    const { updateRolePermissions } = await import("@/modules/organization/service");
    await expect(
      updateRolePermissions(contextOf(owner), { roleId: ownerRole.id, permissionKeys: [] }),
    ).rejects.toThrow(/réduit|propriétaire|principal/i);
  });

  it("permet de modifier les rôles d'un collaborateur", async () => {
    const owner = await createTestActor({ name: "Propriétaire 4" });
    const ctx = contextOf(owner);

    const email = `membre-${Date.now()}@organix.test`;
    await createUserAccount({
      email,
      fullName: "Membre À Promouvoir",
      password: "MotDePasseMembre2026",
      emailVerified: true,
    });

    const profile = await privileged((tx) =>
      tx.query<{ id: string }>("select id from profiles where lower(email) = $1", [email]),
    );
    const memberId = await privileged((tx) =>
      tx.query<{ id: string }>(
        `insert into organization_members (organization_id, user_id, status, joined_at)
         values ($1, $2, 'active', now()) returning id`,
        [owner.organizationId, profile[0]!.id],
      ),
    );

    await updateMember(ctx, {
      memberId: memberId[0]!.id,
      jobTitle: "Responsable commercial",
      departmentId: null,
      roleKeys: ["department_manager"],
    });

    const members = await listMembers(ctx);
    const updated = members.find((member) => member.id === memberId[0]!.id);
    expect(updated?.job_title).toBe("Responsable commercial");
    expect(updated?.roles.map((role) => role.key)).toEqual(["department_manager"]);
  });
});

describe("données de démonstration", () => {
  it("marque une organisation de démonstration et la distingue d'une organisation réelle", async () => {
    const actor = await createTestActor({ name: "Compte de test" });
    const demo = await createOrganization({
      userId: actor.userId,
      userEmail: actor.email,
      name: "Organisation démo de test",
      currency: "XOF",
      timezone: "Africa/Niamey",
      language: "fr",
      isDemo: true,
      slug: `demo-test-${Date.now()}`,
    });

    const rows = await privileged((tx) =>
      tx.query<{ is_demo: boolean }>(
        "select is_demo from organizations where id = $1",
        [demo.organizationId],
      ),
    );
    expect(rows[0]?.is_demo).toBe(true);

    const real = await privileged((tx) =>
      tx.query<{ is_demo: boolean }>("select is_demo from organizations where id = $1", [
        actor.organizationId,
      ]),
    );
    expect(real[0]?.is_demo).toBe(false);

    // Une organisation de démonstration reçoit les mêmes rôles et le même pipeline.
    const stages = await privileged((tx) =>
      tx.query<{ count: number }>(
        "select count(*)::int as count from pipeline_stages where organization_id = $1",
        [demo.organizationId],
      ),
    );
    expect(stages[0]?.count).toBeGreaterThanOrEqual(5);
  });
});
