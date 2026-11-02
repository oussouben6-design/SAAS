"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/server/context";
import { guard, success, type ActionResult } from "@/lib/server/action";
import { AppError } from "@/lib/server/errors";
import { requiredText, uuidSchema } from "@/lib/validation/common";
import { documentSchema } from "@/lib/validation/projects";
import { createFolder, deleteDocument, uploadDocument } from "./service";

export async function uploadDocumentAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("documents", "create");
    const parsed = documentSchema.parse(Object.fromEntries(formData));
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new AppError("validation", "Aucun fichier sélectionné.");
    }
    const result = await uploadDocument(
      { userId: context.user.id, organizationId: context.organization!.id },
      {
        file,
        name: parsed.name ?? undefined,
        description: parsed.description,
        category: parsed.category,
        entityType: parsed.entityType === "" ? null : parsed.entityType,
        entityId: parsed.entityId,
      },
    );
    revalidatePath("/app/documents");
    return success("Document importé.", result);
  });
}

export async function deleteDocumentAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("documents", "delete");
    const { id } = z.object({ id: uuidSchema }).parse(Object.fromEntries(formData));
    await deleteDocument(
      { userId: context.user.id, organizationId: context.organization!.id },
      id,
    );
    revalidatePath("/app/documents");
    return success("Document supprimé.");
  });
}

export async function createFolderAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return guard(async () => {
    const context = await requirePermission("documents", "update");
    const input = z
      .object({
        name: requiredText("Nom du dossier", 1, 120),
        parentId: z.preprocess(
          (value) => (value === "" || value === undefined ? null : value),
          z.string().uuid().nullable(),
        ),
      })
      .parse(Object.fromEntries(formData));
    await createFolder(
      { userId: context.user.id, organizationId: context.organization!.id },
      input,
    );
    revalidatePath("/app/documents");
    return success("Dossier créé.");
  });
}
