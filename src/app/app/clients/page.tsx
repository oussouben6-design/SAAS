import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Download, Plus, Tag, Users } from "lucide-react";
import { requirePagePermission, can } from "@/lib/server/context";
import { listCategories, listCustomers, CUSTOMER_STATUS_LABELS } from "@/modules/crm/service";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect, FormField, Input, Textarea } from "@/components/ui/input";
import { FormDialog } from "@/components/forms/form-dialog";
import { FilterBar, Pagination, StatusBadge } from "@/components/shared/filters";
import { createCategoryAction, createCustomerAction } from "@/modules/crm/actions";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Clients" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; category?: string; page?: string }>;
}) {
  const context = await requirePagePermission("crm", "read");
  const params = await searchParams;
  const orgCtx = { userId: context.user.id, organizationId: context.organization!.id };

  const [data, categories] = await Promise.all([
    listCustomers(orgCtx, {
      q: params.q,
      status: params.status,
      categoryId: params.category,
      page: params.page ? Number(params.page) : 1,
    }),
    listCategories(orgCtx),
  ]);

  const canCreate = can(context, "crm", "create");
  const canUpdate = can(context, "crm", "update");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Clients"
        description="Fiches clients, contacts, historique des échanges et documents associés."
        actions={
          <>
            {can(context, "crm", "export") ? (
              <Button variant="outline" asChild>
                <a
                  href={`/app/clients/export?q=${encodeURIComponent(params.q ?? "")}&status=${params.status ?? ""}`}
                >
                  <Download /> Exporter CSV
                </a>
              </Button>
            ) : null}
            {canUpdate ? (
              <FormDialog
                trigger={
                  <Button variant="outline">
                    <Tag /> Catégorie
                  </Button>
                }
                title="Nouvelle catégorie de clients"
                description="Les catégories servent à segmenter votre portefeuille."
                action={createCategoryAction}
                submitLabel="Créer la catégorie"
                successMessage="Catégorie créée."
              >
                <FormField label="Nom" htmlFor="category-name" required>
                  <Input id="category-name" name="name" required maxLength={60} placeholder="Grand compte" />
                </FormField>
                <FormField label="Couleur" htmlFor="category-color">
                  <NativeSelect id="category-color" name="color" defaultValue="blue">
                    <option value="slate">Ardoise</option>
                    <option value="blue">Bleu</option>
                    <option value="emerald">Émeraude</option>
                    <option value="amber">Ambre</option>
                    <option value="rose">Rose</option>
                    <option value="violet">Violet</option>
                  </NativeSelect>
                </FormField>
              </FormDialog>
            ) : null}
            {canCreate ? (
              <FormDialog
                trigger={
                  <Button>
                    <Plus /> Nouveau client
                  </Button>
                }
                title="Créer un client"
                description="Seuls le nom et le statut sont obligatoires."
                action={createCustomerAction}
                submitLabel="Créer le client"
              >
                <FormField label="Nom du client" htmlFor="name" required>
                  <Input id="name" name="name" required maxLength={160} placeholder="Société Exemple SARL" />
                </FormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Catégorie" htmlFor="categoryId">
                    <NativeSelect id="categoryId" name="categoryId" defaultValue="">
                      <option value="">Aucune</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Statut" htmlFor="status">
                    <NativeSelect id="status" name="status" defaultValue="active">
                      {Object.entries(CUSTOMER_STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="E-mail" htmlFor="email">
                    <Input id="email" name="email" type="email" />
                  </FormField>
                  <FormField label="Téléphone" htmlFor="phone">
                    <Input id="phone" name="phone" />
                  </FormField>
                </div>
                <FormField label="Notes internes" htmlFor="notes">
                  <Textarea id="notes" name="notes" rows={3} />
                </FormField>
              </FormDialog>
            ) : null}
          </>
        }
      />

      <Card className="overflow-hidden">
        <div className="border-b border-border p-4">
          <FilterBar action="/app/clients" q={params.q} placeholder="Nom, e-mail, ville…">
            <NativeSelect name="status" defaultValue={params.status ?? ""} className="w-auto min-w-[150px]">
              <option value="">Tous les statuts</option>
              {Object.entries(CUSTOMER_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect name="category" defaultValue={params.category ?? ""} className="w-auto min-w-[170px]">
              <option value="">Toutes les catégories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </NativeSelect>
          </FilterBar>
        </div>

        {data.items.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<Users />}
              title={params.q || params.status || params.category ? "Aucun client ne correspond" : "Aucun client enregistré"}
              description={
                params.q || params.status || params.category
                  ? "Modifiez ou retirez les filtres pour élargir la recherche."
                  : "Créez votre premier client ou convertissez un prospect depuis le module Prospection."
              }
            />
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Coordonnées</TableHead>
                  <TableHead className="text-center">Contacts</TableHead>
                  <TableHead className="text-center">Projets</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Créé le</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <Link href={`/app/clients/${customer.id}`} className="font-medium hover:text-primary">
                        {customer.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{customer.owner_name ?? "Non assigné"}</p>
                    </TableCell>
                    <TableCell>
                      {customer.category_name ? (
                        <Badge variant="outline">{customer.category_name}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {customer.email ? <div>{customer.email}</div> : null}
                      {customer.phone ? <div>{customer.phone}</div> : null}
                      {customer.city ? <div>{customer.city}</div> : null}
                      {!customer.email && !customer.phone && !customer.city ? "—" : null}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">{customer.contacts_count}</TableCell>
                    <TableCell className="text-center tabular-nums">{customer.projects_count}</TableCell>
                    <TableCell>
                      <StatusBadge status={customer.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(customer.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              basePath="/app/clients"
              params={{ q: params.q, status: params.status, category: params.category }}
            />
          </>
        )}
      </Card>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Building2 className="size-3.5" /> Les suppressions sont logiques : l&apos;historique d&apos;audit est conservé.
      </p>
    </div>
  );
}
