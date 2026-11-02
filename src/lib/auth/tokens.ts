import { createHash, randomBytes } from "node:crypto";

/** Jeton opaque (URL-safe) destiné aux cookies de session ou aux liens à usage unique. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Seul l'empreinte du jeton est stockée : une fuite de la base ne permet pas de rejouer la session. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
