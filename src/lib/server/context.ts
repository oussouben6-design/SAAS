import { cache } from "react";
import { redirect } from "next/navigation";
import { asMember, privileged } from "@/lib/db";
import { validateSession } from "@/lib/auth/service";
import { readActiveOrgCookie, readSessionToken } from "@/lib/auth/cookies";
import { AppError } from "./errors";
import type { ModuleKey, PermissionAction } from "@/lib/permissions/catalog";
import { permissionKey } from "@/lib/permissions/catalog";
import type { AuthUser } from "@/lib/auth/service";

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  currency: string;
  timezone: string;
  language: string;
  logoUrl: string | null;
  industry: string | null;
  isDemo: boolean;
  onboardingCompletedAt: string | null;
}

export interface MemberSummary {
  id: string;
  organizationId: string;
  userId: string;
  status: string;
  isOwner: boolean;
  jobTitle: string | null;
  departmentId: string | null;
  roleKeys: string[];
  permissions: Set<string>;
}

export interface AppContext {
  user: AuthUser;
  organization: OrganizationSummary | null;
  member: MemberSummary | null;
  permissions: Set<string>;
}

export const getSessionUser = cache(async (): Promise<AuthUser | null> => {
  const token = await readSessionToken();
  if (!token) return null;
  const session = await validateSession(token);
  return session?.user ?? null;
});

export async function requireUser(): Promise<AuthUser> {
  const user = await getSessionUser();
  if (!user) redirect("/connexion");
  return user;
}

interface MembershipRow {
  id: string;
  organization_id: string;
  user_id: string;
  status: string;
  is_owner: boolean;
  job_title: string | null;
  department_id: string | null;
  name: string;
  slug: string;
  currency: string;
  timezone: string;
  language: string;
  logo_url: string | null;
  industry: string | null;
  is_demo: boolean;
  onboarding_completed_at: string | null;
}

export const listMemberships = cache(async (userId: string) => {
  return privileged(async (tx) =>
    tx.query<MembershipRow>(
      `select m.id, m.organization_id, m.user_id, m.status, m.is_owner, m.job_title, m.department_id,
              o.name, o.slug, o.currency, o.timezone, o.language, o.logo_url, o.industry,
              o.is_demo, o.onboarding_completed_at
       from organization_members m
       join organizations o on o.id = m.organization_id
       where m.user_id = $1 and m.status = 'active' and o.deleted_at is null
       order by o.created_at asc`,
      [userId],
    ),
  );
});

async function loadPermissionKeys(userId: string, organizationId: string): Promise<Set<string>> {
  const rows = await asMember({ userId, organizationId }, (tx) =>
    tx.query<{ module: string; action: string }>(
      `select p.module, p.action
       from organization_members m
       join member_roles mr on mr.member_id = m.id
       join role_permissions rp on rp.role_id = mr.role_id
       join permissions p on p.id = rp.permission_id
       where m.organization_id = $1 and m.user_id = $2 and m.status = 'active'`,
      [organizationId, userId],
    ),
  );
  return new Set(rows.map((row) => `${row.module}:${row.action}`));
}

export async function loadMemberSummary(
  userId: string,
  organizationId: string,
): Promise<MemberSummary | null> {
  const rows = await asMember({ userId, organizationId }, (tx) =>
    tx.query<{
      id: string;
      organization_id: string;
      user_id: string;
      status: string;
      is_owner: boolean;
      job_title: string | null;
      department_id: string | null;
    }>(
      `select id, organization_id, user_id, status, is_owner, job_title, department_id
       from organization_members
       where organization_id = $1 and user_id = $2 and status = 'active'`,
      [organizationId, userId],
    ),
  );
  const row = rows[0];
  if (!row) return null;

  const [roleRows, permissions] = await Promise.all([
    asMember({ userId, organizationId }, (tx) =>
      tx.query<{ key: string }>(
        `select r.key from member_roles mr
         join roles r on r.id = mr.role_id
         where mr.member_id = $1`,
        [row.id],
      ),
    ),
    loadPermissionKeys(userId, organizationId),
  ]);

  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    status: row.status,
    isOwner: row.is_owner,
    jobTitle: row.job_title,
    departmentId: row.department_id,
    roleKeys: roleRows.map((role) => role.key),
    permissions,
  };
}

export const getAppContext = cache(async (): Promise<AppContext | null> => {
  const user = await getSessionUser();
  if (!user) return null;

  const memberships = await listMemberships(user.id);
  if (memberships.length === 0) {
    return { user, organization: null, member: null, permissions: new Set() };
  }

  const preferred = await readActiveOrgCookie();
  const active =
    memberships.find((membership) => membership.organization_id === preferred) ?? memberships[0]!;

  const member = await loadMemberSummary(user.id, active.organization_id);
  if (!member) {
    return { user, organization: null, member: null, permissions: new Set() };
  }

  return {
    user,
    organization: {
      id: active.organization_id,
      name: active.name,
      slug: active.slug,
      currency: active.currency,
      timezone: active.timezone,
      language: active.language,
      logoUrl: active.logo_url,
      industry: active.industry,
      isDemo: active.is_demo,
      onboardingCompletedAt: active.onboarding_completed_at,
    },
    member,
    permissions: member.permissions,
  };
});

export async function requireContext(): Promise<AppContext> {
  await requireUser();
  const context = await getAppContext();
  if (!context || !context.organization || !context.member) {
    redirect("/onboarding");
  }
  return context;
}

export async function requirePermission(
  moduleKey: ModuleKey,
  action: PermissionAction,
): Promise<AppContext> {
  const context = await requireContext();
  if (!context.permissions.has(permissionKey(moduleKey, action))) {
    throw new AppError("forbidden", "Vous n'avez pas la permission d'effectuer cette action.");
  }
  return context;
}

/**
 * Contrôle d'accès pour les PAGES : redirige vers une page d'explication lisible
 * plutôt que de lever une erreur 500. Les Server Actions continuent d'utiliser
 * `requirePermission` (erreur métier convertie en ActionResult par `guard`).
 */
export async function requirePagePermission(
  moduleKey: ModuleKey,
  action: PermissionAction,
): Promise<AppContext> {
  const context = await requireContext();
  if (!context.permissions.has(permissionKey(moduleKey, action))) {
    redirect(`/app/acces-refuse?module=${encodeURIComponent(moduleKey)}&action=${action}`);
  }
  return context;
}

export function can(context: AppContext | null, moduleKey: ModuleKey, action: PermissionAction): boolean {
  if (!context) return false;
  return context.permissions.has(permissionKey(moduleKey, action));
}

/** Récupère le contexte sans passer par le cache React (server actions). */
export async function freshContext(): Promise<AppContext> {
  const user = await requireUser();
  const memberships = await listMemberships(user.id);
  if (memberships.length === 0) redirect("/onboarding");
  const preferred = await readActiveOrgCookie();
  const active =
    memberships.find((membership) => membership.organization_id === preferred) ?? memberships[0]!;
  const member = await loadMemberSummary(user.id, active.organization_id);
  if (!member) redirect("/onboarding");
  return {
    user,
    organization: {
      id: active.organization_id,
      name: active.name,
      slug: active.slug,
      currency: active.currency,
      timezone: active.timezone,
      language: active.language,
      logoUrl: active.logo_url,
      industry: active.industry,
      isDemo: active.is_demo,
      onboardingCompletedAt: active.onboarding_completed_at,
    },
    member,
    permissions: member.permissions,
  };
}
