import { beforeEach, describe, expect, it } from "vitest";
import { asMember } from "@/lib/db";
import { createCustomer, listCustomers } from "@/modules/crm/service";
import { createTask, listTasks } from "@/modules/tasks/service";
import { createTestActor, contextOf, type TestActor } from "../helpers";

/**
 * Vérifie que l'isolation des organisations et les permissions sont réellement appliquées
 * par PostgreSQL (Row Level Security), et pas seulement par l'interface.
 */

let alice: TestActor;
let bob: TestActor;
let reader: TestActor;

beforeEach(async () => {
  alice = await createTestActor({ name: "Alice Martin", organizationName: "Alpha Conseil" });
  bob = await createTestActor({ name: "Bob Diallo", organizationName: "Beta Industries" });
  reader = await createTestActor({ name: "Rita Lecteur", organizationName: "Gamma SARL", roleKey: "reader" });
});

describe("isolation des organisations (RLS)", () => {
  it("ne laisse pas un utilisateur voir les clients d'une autre organisation", async () => {
    await createCustomer(contextOf(alice), {
      name: "Client Alpha",
      email: "client@alpha.test",
      phone: null,
      website: null,
      address: null,
      city: null,
      country: null,
      taxId: null,
      categoryId: null,
      status: "active",
      notes: null,
    });

    const alphaCustomers = await listCustomers(contextOf(alice), {});
    const betaCustomers = await listCustomers(contextOf(bob), {});

    expect(alphaCustomers.total).toBe(1);
    expect(betaCustomers.total).toBe(0);
  });

  it("refuse une lecture directe des données d'une autre organisation", async () => {
    const created = await createCustomer(contextOf(alice), {
      name: "Client Secret",
      email: null,
      phone: null,
      website: null,
      address: null,
      city: null,
      country: null,
      taxId: null,
      categoryId: null,
      status: "active",
      notes: null,
    });

    const leaked = await asMember(contextOf(bob), (tx) =>
      tx.query("select id, name from customers where id = $1", [created]),
    );
    expect(leaked).toHaveLength(0);
  });

  it("empêche d'insérer des données dans une organisation dont on n'est pas membre", async () => {
    await expect(
      asMember(contextOf(bob), (tx) =>
        tx.query(
          `insert into customers (organization_id, name, status) values ($1, 'Intrusion', 'active')`,
          [alice.organizationId],
        ),
      ),
    ).rejects.toThrow();
  });

  it("empêche un membre suspendu d'accéder aux données", async () => {
    await asMember(contextOf(alice), (tx) =>
      tx.query("select count(*) from customers where organization_id = $1", [alice.organizationId]),
    ).then((rows) => expect(rows).toHaveLength(1));

    const { privileged } = await import("@/lib/db");
    await privileged((tx) =>
      tx.query("update organization_members set status = 'suspended' where id = $1", [alice.memberId]),
    );

    const afterSuspension = await listCustomers(contextOf(alice), {});
    expect(afterSuspension.total).toBe(0);
  });
});

describe("permissions appliquées par la base", () => {
  it("autorise la création de tâches au propriétaire", async () => {
    const id = await createTask(contextOf(alice), {
      title: "Tâche autorisée",
      description: null,
      projectId: null,
      parentTaskId: null,
      assigneeId: alice.userId,
      status: "todo",
      priority: "medium",
      dueDate: null,
    });
    expect(id).toBeTruthy();
    const tasks = await listTasks(contextOf(alice), {});
    expect(tasks).toHaveLength(1);
  });

  it("refuse la création de clients à un rôle lecteur", async () => {
    await expect(
      createCustomer(contextOf(reader), {
        name: "Client interdit",
        email: null,
        phone: null,
        website: null,
        address: null,
        city: null,
        country: null,
        taxId: null,
        categoryId: null,
        status: "active",
        notes: null,
      }),
    ).rejects.toThrow(/row-level security|permission|policy/i);
  });

  it("refuse au lecteur l'accès aux données RH (aucune permission)", async () => {
    // RLS filtre les lignes (pas d'erreur SQL) ou bloque l'écriture : dans les deux cas
    // le lecteur ne doit obtenir aucune donnée RH.
    const outcome = await asMember(contextOf(reader), (tx) =>
      tx.query<{ id: string }>("select id from employees limit 1"),
    ).then(
      (rows) => ({ rows }),
      (error: unknown) => ({ error }),
    );
    if ("rows" in outcome) {
      expect(outcome.rows).toHaveLength(0);
    } else {
      expect(String(outcome.error)).toMatch(/row-level security|permission|policy/i);
    }
    await expect(
      asMember(contextOf(reader), (tx) =>
        tx.query(
          "insert into employees (organization_id, first_name, last_name) values ($1, 'Test', 'RLS')",
          [contextOf(reader).organizationId],
        ),
      ),
    ).rejects.toThrow(/row-level security|permission|policy/i);
  });

  it("autorise le propriétaire à consulter les tables RH (permission accordée)", async () => {
    const rows = await asMember(contextOf(alice), (tx) =>
      tx.query("select count(*)::int as count from employees"),
    );
    expect(rows[0]).toEqual({ count: 0 });
  });
});

describe("journal d'audit", () => {
  it("enregistre une entrée pour chaque création de client", async () => {
    await createCustomer(contextOf(alice), {
      name: "Client Audité",
      email: null,
      phone: null,
      website: null,
      address: null,
      city: null,
      country: null,
      taxId: null,
      categoryId: null,
      status: "active",
      notes: null,
    });

    const logs = await asMember(contextOf(alice), (tx) =>
      tx.query<{ action: string; summary: string }>(
        "select action, summary from audit_logs where organization_id = $1 order by created_at desc",
        [alice.organizationId],
      ),
    );
    expect(logs.some((log) => log.action === "customer.create")).toBe(true);

    const otherOrgLogs = await asMember(contextOf(bob), (tx) =>
      tx.query("select id from audit_logs where organization_id = $1", [alice.organizationId]),
    );
    expect(otherOrgLogs).toHaveLength(0);
  });
});
