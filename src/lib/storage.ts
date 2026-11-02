import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Stockage des fichiers.
 *
 * `local` : répertoire privé sur le serveur (hors dossier public), adapté au développement
 * et à un déploiement mono-instance. `supabase` n'est pas encore implémenté : la fonction
 * lève une erreur explicite plutôt que de simuler un stockage distant.
 */

export type StorageDriver = "local" | "supabase";

export function storageDriver(): StorageDriver {
  return process.env.STORAGE_DRIVER === "supabase" ? "supabase" : "local";
}

function rootDir(): string {
  return process.env.ORGANIX_STORAGE_DIR
    ? path.resolve(process.cwd(), process.env.ORGANIX_STORAGE_DIR)
    : path.join(process.cwd(), ".data", "storage");
}

export function sanitizeFilename(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "fichier";
  const cleaned = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(-120);
  return cleaned || "fichier";
}

export function buildStoragePath(organizationId: string, documentId: string, filename: string): string {
  return `${organizationId}/${documentId}-${sanitizeFilename(filename)}`;
}

function absolutePath(storagePath: string): string {
  const resolved = path.resolve(rootDir(), storagePath);
  if (!resolved.startsWith(path.resolve(rootDir()))) {
    throw new Error("Chemin de stockage invalide.");
  }
  return resolved;
}

export function checksum(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function saveFile(storagePath: string, buffer: Buffer): Promise<void> {
  if (storageDriver() === "supabase") {
    throw new Error(
      "Le stockage Supabase n'est pas implémenté. Configurez STORAGE_DRIVER=local ou consultez docs/architecture/STORAGE.md.",
    );
  }
  const target = absolutePath(storagePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, buffer);
}

export async function readStoredFile(storagePath: string): Promise<Buffer> {
  if (storageDriver() === "supabase") {
    throw new Error("Le stockage Supabase n'est pas implémenté.");
  }
  return readFile(absolutePath(storagePath));
}

export async function storedFileSize(storagePath: string): Promise<number> {
  try {
    const info = await stat(absolutePath(storagePath));
    return info.size;
  } catch {
    return 0;
  }
}

export async function deleteStoredFile(storagePath: string): Promise<void> {
  if (storageDriver() === "supabase") return;
  try {
    await unlink(absolutePath(storagePath));
  } catch {
    // Fichier déjà absent : la suppression logique en base reste cohérente.
  }
}

export { createReadStream };
