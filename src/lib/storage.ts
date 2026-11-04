import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { isServerless, SERVERLESS_STORAGE_ERROR } from "@/lib/config/platform";

/**
 * Stockage des fichiers.
 *
 * `local` : répertoire privé sur le serveur (hors dossier public), adapté au développement
 * et à un déploiement mono-instance.
 * `supabase` : bucket privé Supabase Storage via l'API REST (`SUPABASE_URL`,
 * `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`). Les fichiers restent privés :
 * la lecture passe par le serveur ORGANIX, jamais par une URL publique.
 *
 * Aucune simulation : si la configuration manque ou si l'appel échoue, une erreur explicite
 * est levée afin que l'utilisateur ne croie pas à un enregistrement réussi.
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

interface SupabaseStorageConfig {
  url: string;
  serviceRoleKey: string;
  bucket: string;
}

function supabaseStorageConfig(): SupabaseStorageConfig {
  const url = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "documents";
  if (!url || !serviceRoleKey) {
    throw new Error(
      "STOCKAGE : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis lorsque STORAGE_DRIVER=supabase.",
    );
  }
  return { url, serviceRoleKey, bucket };
}

function supabaseObjectUrl(config: SupabaseStorageConfig, storagePath: string): string {
  const encoded = storagePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encoded}`;
}

function supabaseHeaders(config: SupabaseStorageConfig): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.serviceRoleKey}`,
    apikey: config.serviceRoleKey,
  };
  return headers;
}

async function supabaseFailure(response: Response, action: string): Promise<Error> {
  const detail = await response.text().catch(() => "");
  return new Error(
    `STOCKAGE : ${action} impossible (HTTP ${response.status})${detail ? ` — ${detail.slice(0, 200)}` : ""}`,
  );
}

export async function saveFile(storagePath: string, buffer: Buffer): Promise<void> {
  if (storageDriver() === "supabase") {
    const config = supabaseStorageConfig();
    const response = await fetch(supabaseObjectUrl(config, storagePath), {
      method: "POST",
      headers: {
        ...supabaseHeaders(config),
        "Content-Type": "application/octet-stream",
        "x-upsert": "false",
      },
      body: new Uint8Array(buffer),
    });
    if (!response.ok) throw await supabaseFailure(response, "enregistrement du fichier");
    return;
  }
  if (isServerless()) {
    throw new Error(SERVERLESS_STORAGE_ERROR);
  }
  const target = absolutePath(storagePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, buffer);
}

export async function readStoredFile(storagePath: string): Promise<Buffer> {
  if (storageDriver() === "supabase") {
    const config = supabaseStorageConfig();
    const response = await fetch(supabaseObjectUrl(config, storagePath), {
      headers: supabaseHeaders(config),
    });
    if (!response.ok) throw await supabaseFailure(response, "lecture du fichier");
    return Buffer.from(await response.arrayBuffer());
  }
  return readFile(absolutePath(storagePath));
}

export async function storedFileSize(storagePath: string): Promise<number> {
  if (storageDriver() === "supabase") {
    const config = supabaseStorageConfig();
    const response = await fetch(supabaseObjectUrl(config, storagePath), {
      method: "HEAD",
      headers: supabaseHeaders(config),
    });
    if (!response.ok) return 0;
    const length = Number(response.headers.get("content-length") ?? "0");
    return Number.isFinite(length) ? length : 0;
  }
  try {
    const info = await stat(absolutePath(storagePath));
    return info.size;
  } catch {
    return 0;
  }
}

export async function deleteStoredFile(storagePath: string): Promise<void> {
  if (storageDriver() === "supabase") {
    const config = supabaseStorageConfig();
    const response = await fetch(supabaseObjectUrl(config, storagePath), {
      method: "DELETE",
      headers: supabaseHeaders(config),
    });
    // 404 = fichier déjà absent : la suppression logique en base reste cohérente.
    if (!response.ok && response.status !== 404) {
      throw await supabaseFailure(response, "suppression du fichier");
    }
    return;
  }
  try {
    await unlink(absolutePath(storagePath));
  } catch {
    // Fichier déjà absent : la suppression logique en base reste cohérente.
  }
}

export { createReadStream };
