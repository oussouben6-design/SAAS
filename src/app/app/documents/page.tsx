import type { Metadata } from "next";
import { Download, FileText, FolderPlus, Plus, Trash2, Upload } from "lucide-react";
import { requirePagePermission, can } from "@/lib/server/context";
import {
  ALLOWED_MIME_TYPES,
  DOCUMENT_CATEGORIES,
  listDocuments,
  listFolders,
} from "@/modules/documents/service";
import { PageHeader, EmptyState, Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormField, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { FormDialog } from "@/components/forms/form-dialog";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { FilterBar } from "@/components/shared/filters";
import { createFolderAction, deleteDocumentAction, uploadDocumentAction } from "@/modules/documents/actions";
import { formatDateTime, humanFileSize } from "@/lib/utils";
import { storageDriver } from "@/lib/storage";

export const metadata: Metadata = { title: "Documents" };

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const context = await requirePagePermission("documents", "read");
  const params = await searchParams;
  const orgCtx = { userId: context.user.id, organizationId: context.organization!.id };

  const [documents, folders] = await Promise.all([
    listDocuments(orgCtx, { q: params.q, category: params.category }),
    listFolders(orgCtx),
  ]);

  const canCreate = can(context, "documents", "create");
  const canDelete = can(context, "documents", "delete");
  const driver = storageDriver();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Documents"
        description="Import, classement et téléchargement sécurisé. Les fichiers ne sont jamais exposés publiquement."
        actions={
          <>
            {can(context, "documents", "update") ? (
              <FormDialog
                trigger={
                  <Button variant="outline">
                    <FolderPlus /> Dossier
                  </Button>
                }
                title="Créer un dossier"
                action={createFolderAction}
                submitLabel="Créer le dossier"
              >
                <FormField label="Nom du dossier" htmlFor="folder-name" required>
                  <Input id="folder-name" name="name" required maxLength={120} />
                </FormField>
                <FormField label="Dossier parent" htmlFor="folder-parent">
                  <NativeSelect id="folder-parent" name="parentId" defaultValue="">
                    <option value="">Racine</option>
                    {folders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
              </FormDialog>
            ) : null}
            {canCreate ? (
              <FormDialog
                trigger={
                  <Button>
                    <Plus /> Importer
                  </Button>
                }
                title="Importer un document"
                description="Taille maximale : 10 Mo. Formats : PDF, images, texte, CSV et documents bureautiques."
                action={uploadDocumentAction}
                submitLabel="Importer"
              >
                <FormField label="Fichier" htmlFor="document-file" required hint={ALLOWED_MIME_TYPES.join(", ")}>
                  <Input id="document-file" name="file" type="file" required accept={ALLOWED_MIME_TYPES.join(",")} />
                </FormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Nom affiché" htmlFor="document-name" hint="Facultatif — le nom du fichier est utilisé par défaut.">
                    <Input id="document-name" name="name" maxLength={200} />
                  </FormField>
                  <FormField label="Catégorie" htmlFor="document-category">
                    <NativeSelect id="document-category" name="category" defaultValue="general">
                      {Object.entries(DOCUMENT_CATEGORIES).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Associer à" htmlFor="document-entity">
                    <NativeSelect id="document-entity" name="entityType" defaultValue="">
                      <option value="">Aucune association</option>
                      <option value="customer">Client</option>
                      <option value="project">Projet</option>
                      <option value="task">Tâche</option>
                      <option value="employee">Employé</option>
                      <option value="invoice">Facture</option>
                      <option value="partner">Partenaire</option>
                    </NativeSelect>
                  </FormField>
                  <FormField label="Identifiant de la cible" htmlFor="document-entity-id" hint="Copiez l'identifiant depuis la fiche concernée.">
                    <Input id="document-entity-id" name="entityId" placeholder="UUID" />
                  </FormField>
                </div>
                <FormField label="Description" htmlFor="document-description">
                  <Textarea id="document-description" name="description" rows={2} />
                </FormField>
              </FormDialog>
            ) : null}
          </>
        }
      />

      {driver === "local" ? (
        <Alert variant="info">
          Stockage local actif : les fichiers sont enregistrés dans le répertoire privé du serveur
          (<code>.data/storage</code>). Le stockage Supabase n&apos;est pas encore implémenté et est donc
          explicitement indisponible.
        </Alert>
      ) : (
        <Alert variant="warning" title="Stockage Supabase non disponible">
          STORAGE_DRIVER=supabase est configuré mais ce pilote n&apos;est pas implémenté. Les imports et
          téléchargements échoueront jusqu&apos;à configuration d&apos;un stockage pris en charge.
        </Alert>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-border p-4">
          <FilterBar action="/app/documents" q={params.q} placeholder="Nom ou description…">
            <NativeSelect name="category" defaultValue={params.category ?? ""} className="w-auto min-w-[160px]">
              <option value="">Toutes les catégories</option>
              {Object.entries(DOCUMENT_CATEGORIES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </FilterBar>
        </div>

        {documents.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<FileText />}
              title="Aucun document"
              description="Importez un premier document pour le retrouver ici et le partager avec les membres autorisés."
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Catégorie</TableHead>
                <TableHead>Taille</TableHead>
                <TableHead>Importé par</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((document) => (
                <TableRow key={document.id}>
                  <TableCell>
                    <p className="flex items-center gap-2 font-medium">
                      <FileText className="size-4 text-muted-foreground" />
                      {document.name}
                    </p>
                    {document.entity_type ? (
                      <p className="text-xs text-muted-foreground">Associé à : {document.entity_type}</p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {DOCUMENT_CATEGORIES[document.category as keyof typeof DOCUMENT_CATEGORIES] ?? document.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs tabular-nums">{humanFileSize(Number(document.size_bytes))}</TableCell>
                  <TableCell className="text-xs">{document.uploaded_by_name ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDateTime(document.created_at)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" asChild aria-label="Télécharger">
                        <a href={`/api/documents/${document.id}`}>
                          <Download className="size-4" />
                        </a>
                      </Button>
                      {canDelete ? (
                        <ConfirmDialog
                          trigger={
                            <Button variant="ghost" size="icon" aria-label="Supprimer">
                              <Trash2 className="size-4 text-danger" />
                            </Button>
                          }
                          title="Supprimer ce document ?"
                          description="Le fichier sera retiré du stockage et la fiche archivée."
                          confirmLabel="Supprimer"
                          action={deleteDocumentAction}
                          fields={{ id: document.id }}
                        />
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Upload className="size-3.5" /> Chaque import est journalisé (auteur, taille, empreinte SHA-256).
      </p>
    </div>
  );
}
