import { describe, expect, it } from "vitest";
import { privileged } from "@/lib/db";
import { migrationStatus } from "@/lib/db/migrate";

/**
 * Préconditions vérifiées par `npm run db:status` avant un déploiement Supabase.
 * Ce sont exactement les points qui cassent silencieusement en production :
 *  - bascule vers le rôle applicatif (PostgreSQL 16+ exige SET explicite — migration 0012) ;
 *  - RLS réellement forcée sur toutes les tables métier ;
 *  - migrations complètes.
 */
describe("préparation au déploiement Supabase", () => {
  it("autorise la bascule vers le rôle applicatif", async () => {
    const [row] = await privileged((tx) =>
      tx.query<{ ok: boolean }>("select app.can_set_app_role() as ok"),
    );
    expect(row?.ok).toBe(true);
  });

  it("force la RLS sur toutes les tables qui l'activent", async () => {
    const [row] = await privileged((tx) =>
      tx.query<{ total: number; forced: number }>(
        `select count(*)::int as total, count(*) filter (where c.relforcerowsecurity)::int as forced
           from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
          where c.relkind = 'r' and c.relrowsecurity
            and n.nspname not in ('pg_catalog', 'information_schema', 'storage', 'auth', 'realtime')`,
      ),
    );
    expect(row?.total).toBeGreaterThan(30);
    expect(row?.forced).toBe(row?.total);
  });

  it("applique toutes les migrations, y compris les autorisations de rôle", async () => {
    const status = await privileged((tx) => migrationStatus(tx));
    const pending = status.filter((item) => !item.applied).map((item) => item.name);
    expect(pending).toEqual([]);
    expect(status.some((item) => item.name.startsWith("0012"))).toBe(true);
  });

  it("n'expose jamais les tables d'authentification au rôle applicatif", async () => {
    const rows = await privileged((tx) =>
      tx.query<{ tablename: string; policyname: string | null }>(
        `select t.tablename, p.policyname
           from pg_tables t
           left join pg_policies p on p.tablename = t.tablename and p.schemaname = 'public'
          where t.schemaname = 'public'
            and t.tablename in ('user_credentials', 'sessions', 'verification_tokens')`,
      ),
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.policyname === null)).toBe(true);
  });
});
