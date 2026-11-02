import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
import { requirePagePermission } from "@/lib/server/context";
import { listAuditActions, listAuditLogs } from "@/modules/audit/service";
import { PageHeader, EmptyState, Alert } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/ui/input";
import { FilterBar, Pagination } from "@/components/shared/filters";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Journal d'audit" };

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; action?: string; page?: string }>;
}) {
  const context = await requirePagePermission("audit", "read");
  const params = await searchParams;
  const orgCtx = { userId: context.user.id, organizationId: context.organization!.id };

  const [logs, actions] = await Promise.all([
    listAuditLogs(orgCtx, {
      q: params.q,
      action: params.action,
      page: params.page ? Number(params.page) : 1,
    }),
    listAuditActions(orgCtx),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Journal d'audit"
        description="Traçabilité des actions sensibles : créations, modifications, suppressions, rôles et accès."
      />

      <Alert variant="info">
        Le journal est en lecture seule : aucune entrée ne peut être modifiée ou supprimée depuis
        l&apos;application. Il est conservé même en cas de suppression logique des données.
      </Alert>

      <Card className="overflow-hidden">
        <div className="border-b border-border p-4">
          <FilterBar action="/app/journal" q={params.q} placeholder="Action ou description…">
            <NativeSelect name="action" defaultValue={params.action ?? ""} className="w-auto min-w-[190px]">
              <option value="">Toutes les actions</option>
              {actions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </NativeSelect>
          </FilterBar>
        </div>

        {logs.items.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<ScrollText />}
              title="Aucune entrée"
              description="Les actions réalisées dans l'organisation apparaîtront ici."
            />
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Auteur</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.items.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(entry.created_at)}
                    </TableCell>
                    <TableCell>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{entry.action}</code>
                    </TableCell>
                    <TableCell className="text-sm">{entry.summary}</TableCell>
                    <TableCell className="text-xs">
                      {entry.actor ?? entry.actor_email ?? "Système"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination
              page={logs.page}
              totalPages={logs.totalPages}
              total={logs.total}
              basePath="/app/journal"
              params={{ q: params.q, action: params.action }}
            />
          </>
        )}
      </Card>
    </div>
  );
}
