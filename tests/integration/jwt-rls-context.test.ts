import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { privileged, type SqlExecutor } from "@/lib/db";
import { createCustomer } from "@/modules/crm/service";
import { createTestActor, contextOf, type TestActor } from "../helpers";

/**
 * Contexte RLS et jeton Supabase (migration `0022`).
 *
 * `app.current_user_id()` lit d'abord la variable de session posée par le serveur Next.js, puis —
 * si un schéma `auth` existe — `auth.uid()`, c'est-à-dire le sujet du JWT que PostgREST injecte
 * dans `request.jwt.claims`. Sans ce second volet, toute voie HTTP (RPC `security definer`,
 * abonnements temps réel) arrivait sans identité : `has_permission` faux, lectures filtrées à
 * zéro ligne.
 *
 * Chaque requête est exécutée dans sa propre transaction, sous le rôle applicatif, puis
 * annulée : la RLS n'est évaluée que sous `organix_app` (le propriétaire de la table, lui,
 * la contourne), et aucune écriture de test ne doit survivre.
 *
 * Le schéma `auth` est simulé avec la sémantique de Supabase ; son absence laisse le
 * comportement antérieur intact — c'est ce que couvrent toutes les autres suites, inchangées.
 */

let alice: TestActor;
let bob: TestActor;

const customerBase = {
  email: null,
  phone: null,
  website: null,
  address: null,
  city: null,
  country: null,
  taxId: null,
  categoryId: null,
  status: "active" as const,
  notes: null,
};

/** Requête « façon PostgREST » : rôle applicatif, transaction isolée, rollback systématique. */
async function asHttpRequest<T>(
  context: { jwtSub?: string | null; sessionUserId?: string | null },
  fn: (tx: SqlExecutor) => Promise<T>,
): Promise<T> {
  return privileged(async (tx) => {
    await tx.exec("begin");
    try {
      await tx.exec("set local role organix_app");
      await tx.query("select set_config('organix.user_id', $1, true)", [context.sessionUserId ?? ""]);
      await tx.query("select set_config('request.jwt.claims', $1, true)", [
        context.jwtSub ? JSON.stringify({ sub: context.jwtSub }) : "{}",
      ]);
      return await fn(tx);
    } finally {
      await tx.exec("rollback");
    }
  });
}

function visibleCustomerNames(jwtSub: string | null) {
  return asHttpRequest({ jwtSub }, async (tx) => {
    const rows = await tx.query<{ name: string }>("select name from customers order by name");
    return rows.map((row) => row.name);
  });
}

beforeAll(async () => {
  await privileged(async (tx) => {
    await tx.exec(`
      create schema if not exists auth;
      create or replace function auth.uid() returns uuid
      language sql stable as $$
        select (nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub')::uuid
      $$;
    `);
  });

  alice = await createTestActor({ name: "Alice JWT", organizationName: "Alpha Jeton" });
  bob = await createTestActor({ name: "Bob JWT", organizationName: "Beta Jeton" });

  await createCustomer(contextOf(alice), { ...customerBase, name: "Client visible par Alice" });
  await createCustomer(contextOf(bob), { ...customerBase, name: "Client visible par Bob" });
});

afterAll(async () => {
  await privileged(async (tx) => tx.exec("drop schema if exists auth cascade"));
});

describe("contexte RLS accepté par le jeton Supabase", () => {
  it("ne laisse rien passer sans identité", async () => {
    await expect(visibleCustomerNames(null)).resolves.toEqual([]);
  });

  it("identifie l'appelant à partir du seul sujet du jeton", async () => {
    await expect(visibleCustomerNames(alice.userId)).resolves.toEqual(["Client visible par Alice"]);
    await expect(visibleCustomerNames(bob.userId)).resolves.toEqual(["Client visible par Bob"]);
  });

  it("un jeton dont le sujet ne correspond à aucun membre ne donne accès à rien", async () => {
    await expect(visibleCustomerNames("00000000-0000-4000-8000-000000000000")).resolves.toEqual([]);
  });

  it("garde la priorité au contexte serveur sur le jeton", async () => {
    // Contexte serveur = Bob, jeton = Alice : Bob gagne. Le jeton est un repli, il ne remplace
    // pas l'identité déjà posée par la transaction applicative.
    const names = await asHttpRequest(
      { sessionUserId: bob.userId, jwtSub: alice.userId },
      async (tx) => {
        const rows = await tx.query<{ name: string }>("select name from customers order by name");
        return rows.map((row) => row.name);
      },
    );
    expect(names).toEqual(["Client visible par Bob"]);
  });

  it("maintient l'isolation entre organisations via le jeton", async () => {
    const outsider = await createTestActor({ name: "Carole Dehors", organizationName: "Gamma Jeton" });
    await createCustomer(contextOf(outsider), { ...customerBase, name: "Client de Carole" });

    await expect(visibleCustomerNames(outsider.userId)).resolves.toEqual(["Client de Carole"]);
    await expect(visibleCustomerNames(alice.userId)).resolves.toEqual(["Client visible par Alice"]);
  });

  it("autorise l'écriture dans sa propre organisation, jamais dans une autre", async () => {
    const inserted = await asHttpRequest({ jwtSub: alice.userId }, async (tx) => {
      const rows = await tx.query<{ id: string }>(
        `insert into customers (organization_id, name) values ($1, 'Créé via jeton') returning id`,
        [alice.organizationId],
      );
      return rows.length;
    });
    expect(inserted).toBe(1);

    // `customers_insert` est une politique FOR INSERT avec WITH CHECK = permission crm.create sur
    // l'organisation de la ligne : le jeton d'Alice ne peut pas écrire chez Bob.
    await expect(
      asHttpRequest({ jwtSub: alice.userId }, (tx) =>
        tx.query(
          `insert into customers (organization_id, name) values ($1, 'Intrus')`,
          [bob.organizationId],
        ),
      ),
    ).rejects.toThrow(/row-level security|policy/i);
  });
});
