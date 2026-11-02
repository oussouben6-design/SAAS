import type { Metadata } from "next";
import Link from "next/link";
import { Building, Plus } from "lucide-react";
import { requirePagePermission, can } from "@/lib/server/context";
import { listPartners } from "@/modules/partners/service";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormField, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { FormDialog } from "@/components/forms/form-dialog";
import { FilterBar, Pagination, StatusBadge } from "@/components/shared/filters";
import {
  PARTNER_STATUSES,
  PARTNER_STATUS_LABELS,
  PARTNER_TYPES,
  PARTNER_TYPE_LABELS,
} from "@/lib/validation/partners";
import { createPartnerAction } from "@/modules/partners/actions";

export const metadata: Metadata = { title: "Partenaires" };

export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const context = await requirePagePermission("partners", "read");
  const params = await searchParams;
  const orgCtx = { userId: context.user.id, organizationId: context.organization!.id };
  const canCreate = can(context, "partners", "create");

  const partners = await listPartners(orgCtx, {
    q: params.q,
    type: params.type,
    status: params.status,
    page: params.page ? Number(params.page) : 1,
    pageSize: 20,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Partenaires"
        description="Fournisseurs, institutions, distributeurs et ONG : contacts et conventions."
        actions={
          canCreate ? (
            <FormDialog
              trigger={
                <Button>
                  <Plus /> Nouveau partenaire
                </Button>
              }
              title="Créer un partenaire"
              action={createPartnerAction}
              submitLabel="Créer le partenaire"
            >
              <FormField label="Nom" htmlFor="partner-name" required>
                <Input id="partner-name" name="name" required maxLength={160} placeholder="Fournitures Générales" />
              </FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Type" htmlFor="partner-type">
                  <NativeSelect id="partner-type" name="type" defaultValue="supplier">
                    {PARTNER_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {PARTNER_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
                <FormField label="Statut" htmlFor="partner-status">
                  <NativeSelect id="partner-status" name="status" defaultValue="active">
                    {PARTNER_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {PARTNER_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
                <FormField label="E-mail" htmlFor="partner-email">
                  <Input id="partner-email" name="email" type="email" />
                </FormField>
                <FormField label="Téléphone" htmlFor="partner-phone">
                  <Input id="partner-phone" name="phone" maxLength={40} />
                </FormField>
                <FormField label="Ville" htmlFor="partner-city">
                  <Input id="partner-city" name="city" maxLength={120} />
                </FormField>
                <FormField label="Pays" htmlFor="partner-country">
                  <Input id="partner-country" name="country" maxLength={120} />
                </FormField>
                <FormField label="Site web" htmlFor="partner-website">
                  <Input id="partner-website" name="website" maxLength={200} />
                </FormField>
                <FormField label="Contact principal" htmlFor="partner-contact">
                  <Input id="partner-contact" name="contactPerson" maxLength={120} />
                </FormField>
              </div>
              <FormField label="Adresse" htmlFor="partner-address">
                <Input id="partner-address" name="address" maxLength={300} />
              </FormField>
              <FormField label="Notes" htmlFor="partner-notes">
                <Textarea id="partner-notes" name="notes" rows={2} />
              </FormField>
            </FormDialog>
          ) : null
        }
      />

      <Card className="overflow-hidden">
        <div className="border-b border-border p-4">
          <FilterBar action="/app/partenaires" q={params.q} placeholder="Nom ou ville…">
            <NativeSelect name="type" defaultValue={params.type ?? ""} className="w-auto min-w-[160px]">
              <option value="">Tous les types</option>
              {PARTNER_TYPES.map((type) => (
                <option key={type} value={type}>
                  {PARTNER_TYPE_LABELS[type]}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect name="status" defaultValue={params.status ?? ""} className="w-auto min-w-[140px]">
              <option value="">Tous les statuts</option>
              {PARTNER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {PARTNER_STATUS_LABELS[status]}
                </option>
              ))}
            </NativeSelect>
          </FilterBar>
        </div>

        {partners.items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Building />}
              title="Aucun partenaire"
              description="Ajoutez vos fournisseurs et partenaires institutionnels pour centraliser contacts et conventions."
            />
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Ville</TableHead>
                  <TableHead className="text-right">Contacts</TableHead>
                  <TableHead className="text-right">Conventions</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partners.items.map((partner) => (
                  <TableRow key={partner.id}>
                    <TableCell>
                      <Link href={`/app/partenaires/${partner.id}`} className="font-medium hover:underline">
                        {partner.name}
                      </Link>
                      {partner.email ? (
                        <p className="text-xs text-muted-foreground">{partner.email}</p>
                      ) : null}
                    </TableCell>
                    <TableCell>{PARTNER_TYPE_LABELS[partner.type as keyof typeof PARTNER_TYPE_LABELS] ?? partner.type}</TableCell>
                    <TableCell>{partner.city ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{partner.contacts_count}</TableCell>
                    <TableCell className="text-right tabular-nums">{partner.agreements_count}</TableCell>
                    <TableCell>
                      <StatusBadge
                        status={partner.status}
                        label={PARTNER_STATUS_LABELS[partner.status as keyof typeof PARTNER_STATUS_LABELS]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination
              page={partners.page}
              totalPages={partners.totalPages}
              total={partners.total}
              basePath="/app/partenaires"
              params={{ q: params.q, type: params.type, status: params.status }}
            />
          </>
        )}
      </Card>
    </div>
  );
}
