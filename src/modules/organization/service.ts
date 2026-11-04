import { asMember, privileged } from "@/lib/db";
import { DEFAULT_ROLES, expandGrants, type RoleKey } from "@/lib/permissions/default-roles";
import { MODULE_LABELS, MODULE_ACTIONS, type ModuleKey } from "@/lib/permissions/catalog";
import { AppError } from "@/lib/server/errors";
import { recordAudit } from "@/lib/server/audit";

export interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  legal_name: string | null;
  logo_url: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  description: string | null;
  industry: string | null;
  currency: string;
  timezone: string;
  language: string;
  status: string;
  is_demo: boolean;
  onboarding_completed_at: string | null;
}

export interface DepartmentRow {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  manager_id: string | null;
  manager_name: string | null;
  members_count: number;
}

export interface MemberRow {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  status: string;
  is_owner: boolean;
  job_title: string | null;
  department_id: string | null;
  department_name: string | null;
  roles: { id: string; key: string; name: string }[];
  joined_at: string | null;
  created_at: string;
}

export interface RoleRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  is_system: boolean;
  rank: number;
  permission_keys: string[];
  members_count: number;
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "organisation";
}

const DEFAULT_PIPELINE = [
  { name: "Prospection", position: 10, probability: 10, is_won: false, is_lost: false },
  { name: "Qualification", position: 20, probability: 30, is_won: false, is_lost: false },
  { name: "Proposition", position: 30, probability: 50, is_won: false, is_lost: false },
  { name: "Négociation", position: 40, probability: 75, is_won: false, is_lost: false },
  { name: "Gagnée", position: 50, probability: 100, is_won: true, is_lost: false },
  { name: "Perdue", position: 60, probability: 0, is_won: false, is_lost: true },
];

const DEFAULT_FINANCIAL_CATEGORIES = [
  { kind: "income", name: "Ventes" },
  { kind: "income", name: "Prestations de services" },
  { kind: "income", name: "Subventions" },
  { kind: "expense", name: "Salaires" },
  { kind: "expense", name: "Fournitures" },
  { kind: "expense", name: "Transport" },
  { kind: "expense", name: "Loyer" },
];

/** Crée une organisation complète (rôles, pipeline, catégories, modules) de façon atomique. */
export async function createOrganization(input: {
  userId: string;
  userEmail: string;
  name: string;
  industry?: string | null;
  country?: string | null;
  city?: string | null;
  currency: string;
  timezone: string;
  language: string;
  /** Organisation de démonstration (données fictives, bandeau affiché dans l'interface). */
  isDemo?: boolean;
  /** Slug imposé (jeu de démonstration reproductible) ; sinon dérivé du nom. */
  slug?: string;
}): Promise<{ organizationId: string; slug: string }> {
  return privileged(async (tx) => {
    const baseSlug = input.slug ? slugify(input.slug) : slugify(input.name);
    let slug = baseSlug;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const existing = await tx.query<{ id: string }>("select id from organizations where slug = $1", [
        slug,
      ]);
      if (existing.length === 0) break;
      slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    }

    const orgRows = await tx.query<{ id: string }>(
      `insert into organizations
        (name, slug, industry, country, city, currency, timezone, language, is_demo, created_by, onboarding_completed_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
       returning id`,
      [
        input.name,
        slug,
        input.industry ?? null,
        input.country ?? null,
        input.city ?? null,
        input.currency,
        input.timezone,
        input.language,
        input.isDemo === true,
        input.userId,
      ],
    );
    const organizationId = orgRows[0]!.id;

    const memberRows = await tx.query<{ id: string }>(
      `insert into organization_members (organization_id, user_id, status, is_owner, joined_at)
       values ($1, $2, 'active', true, now()) returning id`,
      [organizationId, input.userId],
    );
    const memberId = memberRows[0]!.id;

    const roleIds = new Map<RoleKey, string>();
    for (const role of DEFAULT_ROLES) {
      const inserted = await tx.query<{ id: string }>(
        `insert into roles (organization_id, key, name, description, is_system, rank)
         values ($1, $2, $3, $4, true, $5) returning id`,
        [organizationId, role.key, role.name, role.description, role.rank],
      );
      const roleId = inserted[0]!.id;
      roleIds.set(role.key, roleId);

      const grants = Array.from(expandGrants(role));
      if (role.grants === "*") {
        await tx.query(
          `insert into role_permissions (role_id, permission_id)
           select $1, id from permissions`,
          [roleId],
        );
      } else if (grants.length > 0) {
        await tx.query(
          `insert into role_permissions (role_id, permission_id)
           select $1, p.id from permissions p
           where p.module || ':' || p.action = any($2::text[])`,
          [roleId, grants],
        );
      }
    }

    await tx.query("insert into member_roles (member_id, role_id) values ($1, $2)", [
      memberId,
      roleIds.get("owner")!,
    ]);

    for (const stage of DEFAULT_PIPELINE) {
      await tx.query(
        `insert into pipeline_stages (organization_id, name, position, probability, is_won, is_lost)
         values ($1, $2, $3, $4, $5, $6)`,
        [organizationId, stage.name, stage.position, stage.probability, stage.is_won, stage.is_lost],
      );
    }

    for (const category of DEFAULT_FINANCIAL_CATEGORIES) {
      await tx.query(
        `insert into financial_categories (organization_id, kind, name) values ($1, $2, $3)
         on conflict (organization_id, kind, name) do nothing`,
        [organizationId, category.kind, category.name],
      );
    }

    for (const moduleKey of Object.keys(MODULE_ACTIONS)) {
      await tx.query(
        `insert into organization_modules (organization_id, module_key, enabled) values ($1, $2, true)
         on conflict (organization_id, module_key) do nothing`,
        [organizationId, moduleKey],
      );
    }

    await recordAudit(tx, {
      organizationId,
      actorId: input.userId,
      actorEmail: input.userEmail,
      action: "organization.create",
      entityType: "organization",
      entityId: organizationId,
      summary: `Création de l'organisation « ${input.name} »`,
    });

    return { organizationId, slug };
  });
}

export async function getOrganization(
  userId: string,
  organizationId: string,
): Promise<OrganizationRow | null> {
  const rows = await asMember({ userId, organizationId }, (tx) =>
    tx.query<OrganizationRow>("select * from organizations where id = $1", [organizationId]),
  );
  return rows[0] ?? null;
}

export async function updateOrganization(
  context: { userId: string; organizationId: string },
  input: {
    name: string;
    legalName: string | null;
    industry: string | null;
    description: string | null;
    address: string | null;
    city: string | null;
    country: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    currency: string;
    timezone: string;
    language: string;
  },
): Promise<void> {
  await asMember(context, async (tx) => {
    await tx.query(
      `update organizations set
        name = $2, legal_name = $3, industry = $4, description = $5, address = $6, city = $7,
        country = $8, phone = $9, email = $10, website = $11, currency = $12, timezone = $13,
        language = $14
       where id = $1`,
      [
        context.organizationId,
        input.name,
        input.legalName,
        input.industry,
        input.description,
        input.address,
        input.city,
        input.country,
        input.phone,
        input.email,
        input.website,
        input.currency,
        input.timezone,
        input.language,
      ],
    );
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "organization.update",
      entityType: "organization",
      entityId: context.organizationId,
      summary: "Mise à jour des paramètres de l'organisation",
      metadata: { currency: input.currency, timezone: input.timezone },
    });
  });
}

export async function listDepartments(
  context: { userId: string; organizationId: string },
): Promise<DepartmentRow[]> {
  return asMember(context, (tx) =>
    tx.query<DepartmentRow>(
      `select d.id, d.name, d.code, d.description, d.manager_id,
              p.full_name as manager_name,
              (select count(*)::int from organization_members m
                where m.department_id = d.id and m.status = 'active') as members_count
       from departments d
       left join profiles p on p.id = d.manager_id
       where d.organization_id = $1 and d.deleted_at is null
       order by d.name asc`,
      [context.organizationId],
    ),
  );
}

export async function createDepartment(
  context: { userId: string; organizationId: string },
  input: { name: string; code: string | null; description: string | null; managerId: string | null },
): Promise<string> {
  return asMember(context, async (tx) => {
    const rows = await tx.query<{ id: string }>(
      `insert into departments (organization_id, name, code, description, manager_id)
       values ($1, $2, $3, $4, $5) returning id`,
      [context.organizationId, input.name, input.code, input.description, input.managerId],
    );
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "department.create",
      entityType: "department",
      entityId: rows[0]!.id,
      summary: `Création du département « ${input.name} »`,
    });
    return rows[0]!.id;
  });
}

export async function updateDepartment(
  context: { userId: string; organizationId: string },
  input: {
    id: string;
    name: string;
    code: string | null;
    description: string | null;
    managerId: string | null;
  },
): Promise<void> {
  await asMember(context, async (tx) => {
    const updated = await tx.query<{ id: string }>(
      `update departments set name = $2, code = $3, description = $4, manager_id = $5
       where id = $1 and organization_id = $6 and deleted_at is null returning id`,
      [input.id, input.name, input.code, input.description, input.managerId, context.organizationId],
    );
    if (updated.length === 0) throw new AppError("not_found", "Département introuvable.");
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "department.update",
      entityType: "department",
      entityId: input.id,
      summary: `Modification du département « ${input.name} »`,
    });
  });
}

export async function deleteDepartment(
  context: { userId: string; organizationId: string },
  departmentId: string,
): Promise<void> {
  await asMember(context, async (tx) => {
    const rows = await tx.query<{ name: string }>(
      `update departments set deleted_at = now()
       where id = $1 and organization_id = $2 and deleted_at is null returning name`,
      [departmentId, context.organizationId],
    );
    if (rows.length === 0) throw new AppError("not_found", "Département introuvable.");
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "department.delete",
      entityType: "department",
      entityId: departmentId,
      summary: `Suppression du département « ${rows[0]!.name} »`,
    });
  });
}

export async function listMembers(
  context: { userId: string; organizationId: string },
): Promise<MemberRow[]> {
  const rows = await asMember(context, (tx) =>
    tx.query<{
      id: string;
      user_id: string;
      full_name: string;
      email: string;
      status: string;
      is_owner: boolean;
      job_title: string | null;
      department_id: string | null;
      department_name: string | null;
      joined_at: string | null;
      created_at: string;
      roles: { id: string; key: string; name: string }[] | null;
    }>(
      `select m.id, m.user_id, p.full_name, p.email, m.status, m.is_owner, m.job_title,
              m.department_id, d.name as department_name, m.joined_at, m.created_at,
              coalesce(
                (select json_agg(json_build_object('id', r.id, 'key', r.key, 'name', r.name) order by r.rank)
                 from member_roles mr join roles r on r.id = mr.role_id
                 where mr.member_id = m.id),
                '[]'::json
              ) as roles
       from organization_members m
       join profiles p on p.id = m.user_id
       left join departments d on d.id = m.department_id
       where m.organization_id = $1
       order by m.is_owner desc, p.full_name asc`,
      [context.organizationId],
    ),
  );
  return rows.map((row) => ({ ...row, roles: row.roles ?? [] }));
}

export async function listRoles(
  context: { userId: string; organizationId: string },
): Promise<RoleRow[]> {
  return asMember(context, (tx) =>
    tx.query<RoleRow>(
      `select r.id, r.key, r.name, r.description, r.is_system, r.rank,
              coalesce((select array_agg(p.module || ':' || p.action order by p.module, p.action)
                        from role_permissions rp join permissions p on p.id = rp.permission_id
                        where rp.role_id = r.id), '{}') as permission_keys,
              (select count(*)::int from member_roles mr where mr.role_id = r.id) as members_count
       from roles r
       where r.organization_id = $1
       order by r.rank asc`,
      [context.organizationId],
    ),
  );
}

export async function updateRolePermissions(
  context: { userId: string; organizationId: string },
  input: { roleId: string; permissionKeys: string[] },
): Promise<void> {
  await asMember(context, async (tx) => {
    const roleRows = await tx.query<{ key: string; name: string }>(
      "select key, name from roles where id = $1 and organization_id = $2",
      [input.roleId, context.organizationId],
    );
    const role = roleRows[0];
    if (!role) throw new AppError("not_found", "Rôle introuvable.");
    if (role.key === "owner") {
      throw new AppError(
        "forbidden",
        "Les permissions du rôle « Administrateur principal » ne peuvent pas être réduites.",
      );
    }
    await tx.query("delete from role_permissions where role_id = $1", [input.roleId]);
    if (input.permissionKeys.length > 0) {
      await tx.query(
        `insert into role_permissions (role_id, permission_id)
         select $1, p.id from permissions p
         where p.module || ':' || p.action = any($2::text[])`,
        [input.roleId, input.permissionKeys],
      );
    }
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "role.permissions.update",
      entityType: "role",
      entityId: input.roleId,
      summary: `Mise à jour des permissions du rôle « ${role.name} »`,
      metadata: { count: input.permissionKeys.length },
    });
  });
}

export async function updateMember(
  context: { userId: string; organizationId: string },
  input: {
    memberId: string;
    jobTitle: string | null;
    departmentId: string | null;
    roleKeys: string[];
  },
): Promise<void> {
  await asMember(context, async (tx) => {
    const targets = await tx.query<{ id: string; is_owner: boolean; user_id: string; full_name: string }>(
      `select m.id, m.is_owner, m.user_id, p.full_name
       from organization_members m join profiles p on p.id = m.user_id
       where m.id = $1 and m.organization_id = $2`,
      [input.memberId, context.organizationId],
    );
    const target = targets[0];
    if (!target) throw new AppError("not_found", "Collaborateur introuvable.");

    if (target.is_owner && context.userId !== target.user_id) {
      throw new AppError("forbidden", "Le compte propriétaire ne peut être modifié que par lui-même.");
    }

    await tx.query(
      `update organization_members set job_title = $2, department_id = $3
       where id = $1 and organization_id = $4`,
      [input.memberId, input.jobTitle, input.departmentId, context.organizationId],
    );

    if (target.is_owner) return; // Le propriétaire conserve tous ses droits.

    await tx.query("delete from member_roles where member_id = $1", [input.memberId]);
    if (input.roleKeys.length > 0) {
      await tx.query(
        `insert into member_roles (member_id, role_id)
         select $1, r.id from roles r where r.organization_id = $2 and r.key = any($3::text[])`,
        [input.memberId, context.organizationId, input.roleKeys],
      );
    }
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "member.roles.update",
      entityType: "member",
      entityId: input.memberId,
      summary: `Mise à jour du collaborateur « ${target.full_name} »`,
      metadata: { roleKeys: input.roleKeys },
    });
  });
}

export async function setMemberStatus(
  context: { userId: string; organizationId: string },
  input: { memberId: string; status: "active" | "suspended" },
): Promise<void> {
  await asMember(context, async (tx) => {
    const targets = await tx.query<{ is_owner: boolean; full_name: string }>(
      `select m.is_owner, p.full_name
       from organization_members m join profiles p on p.id = m.user_id
       where m.id = $1 and m.organization_id = $2`,
      [input.memberId, context.organizationId],
    );
    const target = targets[0];
    if (!target) throw new AppError("not_found", "Collaborateur introuvable.");
    if (target.is_owner) {
      throw new AppError("forbidden", "Le compte propriétaire ne peut pas être désactivé.");
    }
    await tx.query(
      "update organization_members set status = $2 where id = $1 and organization_id = $3",
      [input.memberId, input.status, context.organizationId],
    );
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "member.status.update",
      entityType: "member",
      entityId: input.memberId,
      summary: `Statut de « ${target.full_name} » changé en ${input.status}`,
    });
  });
}

export async function removeMember(
  context: { userId: string; organizationId: string },
  memberId: string,
): Promise<void> {
  await asMember(context, async (tx) => {
    const targets = await tx.query<{ is_owner: boolean; full_name: string; user_id: string }>(
      `select m.is_owner, p.full_name, m.user_id
       from organization_members m join profiles p on p.id = m.user_id
       where m.id = $1 and m.organization_id = $2`,
      [memberId, context.organizationId],
    );
    const target = targets[0];
    if (!target) throw new AppError("not_found", "Collaborateur introuvable.");
    if (target.is_owner || target.user_id === context.userId) {
      throw new AppError("forbidden", "Vous ne pouvez pas retirer ce collaborateur.");
    }
    await tx.query("delete from organization_members where id = $1 and organization_id = $2", [
      memberId,
      context.organizationId,
    ]);
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "member.remove",
      entityType: "member",
      entityId: memberId,
      summary: `Retrait du collaborateur « ${target.full_name} »`,
    });
  });
}

export async function listModules(
  context: { userId: string; organizationId: string },
): Promise<{ moduleKey: ModuleKey; enabled: boolean }[]> {
  const rows = await asMember(context, (tx) =>
    tx.query<{ module_key: string; enabled: boolean }>(
      "select module_key, enabled from organization_modules where organization_id = $1",
      [context.organizationId],
    ),
  );
  const map = new Map(rows.map((row) => [row.module_key, row.enabled]));
  return (Object.keys(MODULE_LABELS) as ModuleKey[]).map((moduleKey) => ({
    moduleKey,
    enabled: map.get(moduleKey) ?? true,
  }));
}

export async function setModuleEnabled(
  context: { userId: string; organizationId: string },
  input: { moduleKey: string; enabled: boolean },
): Promise<void> {
  if (!(input.moduleKey in MODULE_ACTIONS)) {
    throw new AppError("validation", "Module inconnu.");
  }
  await asMember(context, async (tx) => {
    await tx.query(
      `insert into organization_modules (organization_id, module_key, enabled)
       values ($1, $2, $3)
       on conflict (organization_id, module_key) do update set enabled = excluded.enabled`,
      [context.organizationId, input.moduleKey, input.enabled],
    );
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "module.toggle",
      entityType: "organization",
      entityId: context.organizationId,
      summary: `Module « ${input.moduleKey} » ${input.enabled ? "activé" : "désactivé"}`,
    });
  });
}
