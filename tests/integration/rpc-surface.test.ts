import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { privileged, type SqlExecutor } from "@/lib/db";
import { createCustomer } from "@/modules/crm/service";
import { createTestActor, contextOf, type TestActor } from "../helpers";

/**
 * Modèle « RPC assumé » réellement exécutable (migration `0026`).
 *
 * Mesures faites le 12 novembre 2026 sur le projet Supabase `opnlvqwbevnivfjpbrxa` :
 *
 *  1. `has_schema_privilege('authenticated', 'app', 'USAGE')` → **false**. `0013` puis `0020`
 *     révoquent l'usage du schéma `app`, et rien ne l'a rétabli. Conséquence mesurée :
 *     `set local role authenticated; select app.current_user_id();` →
 *     `42501: permission denied for schema app`. PostgreSQL contrôle l'usage du schéma AVANT
 *     d'exécuter la fonction : toute politique RLS appelant `app.has_permission(...)` échouait
 *     donc sur chaque voie PostgREST / Realtime / RPC. Le contexte JWT de `0022` était juste
 *     mais inatteignable.
 *  2. `public.rls_auto_enable()` restait exécutable par `anon` et `authenticated` : son `proacl`
 *     valait `{=X/postgres,…}`, c'est-à-dire un droit hérité de PUBLIC. `0020` et `0023`
 *     révoquaient l'exécution aux rôles **nommés**, ce qui ne retire pas un droit hérité — les
 *     deux migrations paraissaient appliquées sans rien changer.
 *  3. `quotes` / `quote_items` étaient soumises au module `crm` en base alors que l'application
 *     exige `finance` sur toute la page devis (`requirePagePermission("finance", …)`,
 *     `requirePermission("finance", "create" | "update")`). Cet écart est couvert plus bas.
 *
 * Le projet Supabase est simulé : `anon`, `authenticated` et `service_role` sont créés, puis la
 * migration est rejouée (elle est idempotente). PGlite étant un PostgreSQL réel, les contrôles
 * de privilège sont ceux de la production.
 */

const SUPABASE_ROLES = ["anon", "authenticated", "service_role"] as const;

let rolesCreated = false;

async function createSupabaseRoles(): Promise<boolean> {
  return privileged(async (tx) => {
    for (const role of SUPABASE_ROLES) {
      if (!(await tx.query("select 1 from pg_roles where rolname = $1", [role])).length) {
        await tx.exec(`create role ${role} nologin`);
        rolesCreated = true;
      }
    }
    return true;
  });
}

/** Rejoue la migration sur la base de test, comme sur un projet Supabase neuf. */
async function replayMigration(): Promise<void> {
  const file = path.join(process.cwd(), "supabase", "migrations", "0026_rpc_surface_enforcement.sql");
  const sql = await readFile(file, "utf8");
  await privileged((tx) => tx.exec(sql));
}

/** Exécute `fn` sous le rôle applicatif avec un contexte de session (transaction annulée). */
async function asSession<T>(userId: string, organizationId: string, fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
  return privileged(async (tx) => {
    await tx.exec("begin");
    try {
      await tx.exec("set local role organix_app");
      await tx.query("select set_config('organix.user_id', $1, true)", [userId]);
      await tx.query("select set_config('organix.organization_id', $1, true)", [organizationId]);
      return await fn(tx);
    } finally {
      await tx.exec("rollback");
    }
  });
}

it("prépare un projet Supabase simulé et rejoue la migration", async () => {
  await createSupabaseRoles();
  await replayMigration();
});

describe("schéma app utilisable par le rôle HTTP (0026)", () => {
  it("accorde l'usage du schéma app à authenticated, jamais à anon", async () => {
    const [row] = await privileged((tx) =>
      tx.query<{ authenticated: boolean; anon: boolean }>(
        `select has_schema_privilege('authenticated', 'app', 'USAGE') as authenticated,
                has_schema_privilege('anon', 'app', 'USAGE') as anon`,
      ),
    );
    expect(row?.authenticated).toBe(true);
    expect(row?.anon).toBe(false);
  });

  it("rend les prédicats de politiques exécutables par authenticated", async () => {
    const [row] = await privileged((tx) =>
      tx.query<{ context: boolean; permission: boolean; member: boolean; admin: boolean }>(
        `select has_function_privilege('authenticated', 'app.current_user_id()', 'EXECUTE') as context,
                has_function_privilege('authenticated', 'app.has_permission(uuid, text, text)', 'EXECUTE') as permission,
                has_function_privilege('authenticated', 'app.is_member(uuid)', 'EXECUTE') as member,
                has_function_privilege('authenticated', 'app.is_org_admin(uuid)', 'EXECUTE') as admin`,
      ),
    );
    expect(row).toEqual({ context: true, permission: true, member: true, admin: true });
  });

  it("garde les déclencheurs et les fonctions internes hors de portée des rôles HTTP", async () => {
    const rows = await privileged((tx) =>
      tx.query<{ name: string; anon: boolean; authenticated: boolean }>(
        `select p.proname as name,
                has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
                has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname in ('invoice_before_set_totals', 'quote_before_set_totals',
                              'invoice_items_recalc_totals', 'quote_items_recalc_totals',
                              'payments_recalc_paid', 'handle_new_user',
                              'sync_auth_email_confirmation', 'notify_task_assigned',
                              'notify_leave_decided')
          order by 1`,
      ),
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect({ fn: row.name, anon: row.anon, auth: row.authenticated }).toEqual({
        fn: row.name,
        anon: false,
        auth: false,
      });
    }
  });

  it("ne laisse aucun EXECUTE hérité de PUBLIC sur les fonctions du schéma app", async () => {
    const rows = await privileged((tx) =>
      tx.query<{ fn: string }>(
        `select n.nspname || '.' || p.proname as fn
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname in ('app', 'public') and p.prokind = 'f'
            and (p.proacl is null
                 or exists (select 1 from unnest(p.proacl) a where a::text like '=X/%'))`,
      ),
    );
    expect(rows.map((row) => row.fn)).toEqual([]);
  });
});

describe("devis soumis au module finance, comme l'application (0026)", () => {
  let owner: TestActor;
  let financeOnlyUserId: string;

  beforeAll(async () => {
    owner = await createTestActor({ name: "Propriétaire devis" });
    await createCustomer(contextOf(owner), {
      name: "Client devis 0026",
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

    // Rôle sur mesure : TOUTES les permissions finance, AUCUNE permission crm.
    // C'est le cas d'un comptable — et exactement ce que l'application autorise
    // (`requirePagePermission("finance", …)`), alors que la RLS exigeait `crm`.
    financeOnlyUserId = await privileged(async (tx) => {
      const [user] = await tx.query<{ id: string }>(
        `insert into profiles (id, email, full_name)
         values (gen_random_uuid(), $1, 'Comptable finance seule') returning id`,
        [`comptable-${Date.now()}@organix.test`],
      );
      const [member] = await tx.query<{ id: string }>(
        `insert into organization_members (organization_id, user_id, status, joined_at)
         values ($1, $2, 'active', now()) returning id`,
        [owner.organizationId, user!.id],
      );
      const [role] = await tx.query<{ id: string }>(
        `insert into roles (organization_id, key, name, description, is_system, rank)
         values ($1, $2, 'Comptable', 'Finance uniquement', false, 45) returning id`,
        [owner.organizationId, `comptable_${Date.now()}`],
      );
      await tx.query(
        `insert into role_permissions (role_id, permission_id)
         select $1, id from permissions where module = 'finance'`,
        [role!.id],
      );
      await tx.query("insert into member_roles (member_id, role_id) values ($1, $2)", [
        member!.id,
        role!.id,
      ]);
      return user!.id;
    });
  });

  it("un comptable sans permission crm crée et relit un devis", async () => {
    const result = await asSession(financeOnlyUserId, owner.organizationId, async (tx) => {
      const [perms] = await tx.query<{ finance_create: boolean; finance_read: boolean; crm_create: boolean }>(
        `select app.has_permission($1, 'finance', 'create') as finance_create,
                app.has_permission($1, 'finance', 'read') as finance_read,
                app.has_permission($1, 'crm', 'create') as crm_create`,
        [owner.organizationId],
      );

      const [quote] = await tx.query<{ id: string; number: string }>(
        `insert into quotes
           (organization_id, number, subject, status, issue_date, currency, subtotal_minor, tax_rate, total_minor, created_by)
         values ($1, $2, 'Devis comptable', 'draft', current_date, 'XOF', 100000, 0, 100000, $3)
         returning id, number`,
        [owner.organizationId, `DEV-0026-${Date.now()}`, financeOnlyUserId],
      );

      await tx.query(
        `insert into quote_items (quote_id, description, quantity, unit_price_minor, amount_minor, position)
         values ($1, 'Ligne comptable', 1, 100000, 100000, 10)`,
        [quote!.id],
      );

      const items = await tx.query<{ description: string }>(
        "select description from quote_items where quote_id = $1",
        [quote!.id],
      );
      return { perms: perms!, number: quote!.number, items };
    });

    expect(result.perms.crm_create).toBe(false);
    expect(result.perms.finance_create).toBe(true);
    expect(result.number).toMatch(/^DEV-0026-/);
    expect(result.items.map((row) => row.description)).toEqual(["Ligne comptable"]);
  });

  it("refuse toujours un membre sans permission finance", async () => {
    const outsider = await createTestActor({ name: "Lecteur devis" });
    const visible = await asSession(outsider.userId, owner.organizationId, async (tx) => {
      const rows = await tx.query<{ id: string }>("select id from quotes");
      return rows.length;
    });
    // Le lecteur n'a pas `finance:read` : aucune ligne de devis ne lui est visible.
    expect(visible).toBe(0);
  });
});

afterAll(async () => {
  if (!rolesCreated) return;
  await privileged(async (tx) => {
    for (const role of SUPABASE_ROLES) {
      await tx.exec(`drop owned by ${role} cascade`).catch(() => undefined);
      await tx.exec(`drop role if exists ${role}`).catch(() => undefined);
    }
  });
});
