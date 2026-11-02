import { asMember } from "@/lib/db";
import type { AppContext } from "@/lib/server/context";
import { can } from "@/lib/server/context";

export interface SearchHit {
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
  type: "client" | "projet" | "tache" | "document" | "prospect" | "partenaire";
  badge?: string | null;
}

export async function globalSearch(context: AppContext, query: string): Promise<SearchHit[]> {
  const organization = context.organization;
  if (!organization || !context.member) return [];
  const q = query.trim();
  if (q.length < 2) return [];
  const like = `%${q.toLowerCase()}%`;

  const hits = await asMember(
    { userId: context.user.id, organizationId: organization.id },
    async (tx) => {
      const results: SearchHit[] = [];

      if (can(context, "crm", "read")) {
        const customers = await tx.query<{ id: string; name: string; email: string | null }>(
          `select id, name, email from customers
           where organization_id = $1 and deleted_at is null
             and (lower(name) like $2 or lower(coalesce(email,'')) like $2)
           limit 6`,
          [organization.id, like],
        );
        results.push(
          ...customers.map((row) => ({
            id: row.id,
            title: row.name,
            subtitle: row.email,
            href: `/app/clients/${row.id}`,
            type: "client" as const,
            badge: "Client",
          })),
        );
      }

      if (can(context, "prospection", "read")) {
        const leads = await tx.query<{ id: string; name: string; company: string | null }>(
          `select id, name, company from leads
           where organization_id = $1 and deleted_at is null
             and (lower(name) like $2 or lower(coalesce(company,'')) like $2)
           limit 4`,
          [organization.id, like],
        );
        results.push(
          ...leads.map((row) => ({
            id: row.id,
            title: row.name,
            subtitle: row.company,
            href: `/app/prospection?lead=${row.id}`,
            type: "prospect" as const,
            badge: "Prospect",
          })),
        );
      }

      if (can(context, "projects", "read")) {
        const projects = await tx.query<{ id: string; name: string; code: string | null }>(
          `select id, name, code from projects
           where organization_id = $1 and deleted_at is null
             and (lower(name) like $2 or lower(coalesce(code,'')) like $2)
           limit 5`,
          [organization.id, like],
        );
        results.push(
          ...projects.map((row) => ({
            id: row.id,
            title: row.name,
            subtitle: row.code,
            href: `/app/projets/${row.id}`,
            type: "projet" as const,
            badge: "Projet",
          })),
        );
      }

      if (can(context, "tasks", "read")) {
        const tasks = await tx.query<{ id: string; title: string; status: string }>(
          `select id, title, status from tasks
           where organization_id = $1 and deleted_at is null and lower(title) like $2
           limit 6`,
          [organization.id, like],
        );
        results.push(
          ...tasks.map((row) => ({
            id: row.id,
            title: row.title,
            subtitle: `Statut : ${row.status}`,
            href: `/app/taches?task=${row.id}`,
            type: "tache" as const,
            badge: "Tâche",
          })),
        );
      }

      if (can(context, "documents", "read")) {
        const documents = await tx.query<{ id: string; name: string; category: string }>(
          `select id, name, category from documents
           where organization_id = $1 and deleted_at is null and lower(name) like $2
           limit 5`,
          [organization.id, like],
        );
        results.push(
          ...documents.map((row) => ({
            id: row.id,
            title: row.name,
            subtitle: row.category,
            href: `/app/documents?document=${row.id}`,
            type: "document" as const,
            badge: "Document",
          })),
        );
      }

      if (can(context, "partners", "read")) {
        const partners = await tx.query<{ id: string; name: string; type: string }>(
          `select id, name, type from partners
           where organization_id = $1 and deleted_at is null and lower(name) like $2 limit 4`,
          [organization.id, like],
        );
        results.push(
          ...partners.map((row) => ({
            id: row.id,
            title: row.name,
            subtitle: row.type,
            href: `/app/partenaires`,
            type: "partenaire" as const,
            badge: "Partenaire",
          })),
        );
      }

      return results;
    },
  );

  return hits;
}
