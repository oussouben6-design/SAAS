import { asMember } from "@/lib/db";
import { AppError } from "@/lib/server/errors";
import { recordAudit } from "@/lib/server/audit";
import {
  buildStoragePath,
  checksum,
  deleteStoredFile,
  readStoredFile,
  sanitizeFilename,
  saveFile,
  storageDriver,
} from "@/lib/storage";

export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 10 * 1024 * 1024);

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.ms-excel",
] as const;

export const DOCUMENT_CATEGORIES = {
  general: "Général",
  contract: "Contrat",
  invoice: "Facture",
  report: "Rapport",
  hr: "RH",
  project: "Projet",
  legal: "Juridique",
  other: "Autre",
} as const;

export type DocumentCategory = keyof typeof DOCUMENT_CATEGORIES;

export interface DocumentRow {
  id: string;
  name: string;
  description: string | null;
  category: string;
  mime_type: string;
  size_bytes: string;
  storage_path: string;
  entity_type: string | null;
  entity_id: string | null;
  uploaded_by_name: string | null;
  created_at: string;
  folder_name: string | null;
}

export async function listDocuments(
  context: { userId: string; organizationId: string },
  filters: { q?: string; category?: string; entityType?: string; entityId?: string },
): Promise<DocumentRow[]> {
  const q = filters.q?.trim() ? `%${filters.q.trim().toLowerCase()}%` : null;
  return asMember(context, (tx) =>
    tx.query<DocumentRow>(
      `select d.id, d.name, d.description, d.category, d.mime_type, d.size_bytes::text as size_bytes,
              d.storage_path, d.entity_type, d.entity_id, p.full_name as uploaded_by_name,
              d.created_at, f.name as folder_name
       from documents d
       left join profiles p on p.id = d.uploaded_by
       left join document_folders f on f.id = d.folder_id
       where d.organization_id = $1 and d.deleted_at is null
         and ($2::text is null or lower(d.name) like $2 or lower(coalesce(d.description, '')) like $2)
         and ($3::text is null or d.category = $3)
         and ($4::text is null or d.entity_type = $4)
         and ($5::uuid is null or d.entity_id = $5)
       order by d.created_at desc limit 200`,
      [
        context.organizationId,
        q,
        filters.category || null,
        filters.entityType || null,
        filters.entityId || null,
      ],
    ),
  );
}

export async function uploadDocument(
  context: { userId: string; organizationId: string },
  input: {
    file: File;
    name?: string;
    description: string | null;
    category: DocumentCategory;
    entityType: string | null;
    entityId: string | null;
  },
): Promise<{ id: string }> {
  if (storageDriver() === "supabase") {
    throw new AppError(
      "unavailable",
      "Le stockage Supabase n'est pas encore implémenté. Utilisez le stockage local (STORAGE_DRIVER=local).",
    );
  }
  if (!input.file || input.file.size === 0) {
    throw new AppError("validation", "Aucun fichier sélectionné.");
  }
  if (input.file.size > MAX_UPLOAD_BYTES) {
    throw new AppError(
      "validation",
      `Fichier trop volumineux (limite : ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} Mo).`,
    );
  }
  const mime = input.file.type || "application/octet-stream";
  if (!ALLOWED_MIME_TYPES.includes(mime as (typeof ALLOWED_MIME_TYPES)[number])) {
    throw new AppError("validation", `Type de fichier non autorisé (${mime}).`);
  }

  const buffer = Buffer.from(await input.file.arrayBuffer());
  const hash = checksum(buffer);
  const displayName = sanitizeFilename(input.name?.trim() || input.file.name || "document");
  const documentId = crypto.randomUUID();
  const storagePath = buildStoragePath(context.organizationId, documentId, displayName);

  await saveFile(storagePath, buffer);

  try {
    return await asMember(context, async (tx) => {
      const rows = await tx.query<{ id: string }>(
        `insert into documents
          (id, organization_id, name, description, category, mime_type, size_bytes, storage_provider,
           storage_path, checksum, entity_type, entity_id, uploaded_by)
         values ($1,$2,$3,$4,$5,$6,$7,'local',$8,$9,$10,$11,$12)
         returning id`,
        [
          documentId,
          context.organizationId,
          displayName,
          input.description,
          input.category,
          mime,
          buffer.length,
          storagePath,
          hash,
          input.entityType,
          input.entityId,
          context.userId,
        ],
      );
      await recordAudit(tx, {
        organizationId: context.organizationId,
        actorId: context.userId,
        action: "document.upload",
        entityType: "document",
        entityId: documentId,
        summary: `Import du document « ${displayName} »`,
        metadata: { size: buffer.length, mime },
      });
      return { id: rows[0]!.id };
    });
  } catch (error) {
    await deleteStoredFile(storagePath);
    throw error;
  }
}

export async function getDocumentForDownload(
  context: { userId: string; organizationId: string },
  documentId: string,
): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  const rows = await asMember(context, (tx) =>
    tx.query<{ name: string; mime_type: string; storage_path: string }>(
      `select name, mime_type, storage_path from documents
       where id = $1 and organization_id = $2 and deleted_at is null`,
      [documentId, context.organizationId],
    ),
  );
  const row = rows[0];
  if (!row) throw new AppError("not_found", "Document introuvable.");
  let buffer: Buffer;
  try {
    buffer = await readStoredFile(row.storage_path);
  } catch {
    throw new AppError("unavailable", "Le fichier n'est plus présent sur le stockage.");
  }
  return { name: row.name, mimeType: row.mime_type, buffer };
}

export async function deleteDocument(
  context: { userId: string; organizationId: string },
  documentId: string,
): Promise<void> {
  const storagePath = await asMember(context, async (tx) => {
    const rows = await tx.query<{ name: string; storage_path: string }>(
      `update documents set deleted_at = now()
       where id = $1 and organization_id = $2 and deleted_at is null
       returning name, storage_path`,
      [documentId, context.organizationId],
    );
    if (rows.length === 0) throw new AppError("not_found", "Document introuvable.");
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "document.delete",
      entityType: "document",
      entityId: documentId,
      summary: `Suppression du document « ${rows[0]!.name} »`,
    });
    return rows[0]!.storage_path;
  });
  await deleteStoredFile(storagePath);
}

export async function listFolders(
  context: { userId: string; organizationId: string },
): Promise<{ id: string; name: string; parent_id: string | null }[]> {
  return asMember(context, (tx) =>
    tx.query<{ id: string; name: string; parent_id: string | null }>(
      "select id, name, parent_id from document_folders where organization_id = $1 order by name asc",
      [context.organizationId],
    ),
  );
}

export async function createFolder(
  context: { userId: string; organizationId: string },
  input: { name: string; parentId: string | null },
): Promise<void> {
  await asMember(context, async (tx) => {
    try {
      await tx.query(
        "insert into document_folders (organization_id, name, parent_id, created_by) values ($1,$2,$3,$4)",
        [context.organizationId, input.name, input.parentId, context.userId],
      );
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "23505") {
        throw new AppError("conflict", "Un dossier porte déjà ce nom à cet emplacement.");
      }
      throw error;
    }
  });
}
