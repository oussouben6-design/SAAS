import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/** Paramètres scrypt conformes aux recommandations OWASP (2000). */
const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LENGTH = 64;
export const PASSWORD_ALGORITHM = `scrypt:${PARAMS.N}:${PARAMS.r}:${PARAMS.p}`;

export interface PasswordHash {
  hash: string;
  salt: string;
  algorithm: string;
}

export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, PARAMS);
  return {
    hash: derived.toString("hex"),
    salt: salt.toString("hex"),
    algorithm: PASSWORD_ALGORITHM,
  };
}

export async function verifyPassword(
  password: string,
  stored: PasswordHash,
): Promise<boolean> {
  const [name, n, r, p] = stored.algorithm.split(":");
  if (name !== "scrypt" || !n || !r || !p) return false;
  const params = { N: Number(n), r: Number(r), p: Number(p), maxmem: PARAMS.maxmem };
  const expected = Buffer.from(stored.hash, "hex");
  const derived = await scrypt(
    password.normalize("NFKC"),
    Buffer.from(stored.salt, "hex"),
    expected.length || KEY_LENGTH,
    params,
  );
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
