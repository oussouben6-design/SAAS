import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * TOTP (RFC 6238) compatible Google Authenticator / Authy / 1Password.
 * Aucune dépendance externe : HMAC-SHA1, pas de 30 s, 6 chiffres.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const DIGITS = 6;
const STEP_SECONDS = 30;

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s-]/g, "").replace(/=+$/, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error("Secret TOTP invalide (base32 attendu).");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Secret de 160 bits, format base32 sans séparateur (compatible applications mobiles). */
export function generateTotpSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

export function hotp(secret: string, counter: number, digits = DIGITS): string {
  const key = base32Decode(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", key).update(buffer).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const binary =
    (((digest[offset] ?? 0) & 0x7f) << 24) |
    (((digest[offset + 1] ?? 0) & 0xff) << 16) |
    (((digest[offset + 2] ?? 0) & 0xff) << 8) |
    ((digest[offset + 3] ?? 0) & 0xff);
  return (binary % 10 ** digits).toString().padStart(digits, "0");
}

export function totp(secret: string, at: number = Date.now(), step = STEP_SECONDS): string {
  return hotp(secret, Math.floor(at / 1000 / step));
}

/**
 * Vérifie un code à ±`window` pas de temps (dérive d'horloge tolérée).
 * Comparaison à temps constant, format strictement 6 chiffres.
 */
export function verifyTotp(
  secret: string,
  code: string,
  options: { at?: number; window?: number; step?: number } = {},
): boolean {
  const candidate = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(candidate)) return false;
  const at = options.at ?? Date.now();
  const window = options.window ?? 1;
  const step = options.step ?? STEP_SECONDS;
  const counter = Math.floor(at / 1000 / step);
  const candidateBuffer = Buffer.from(candidate);
  let match = false;
  for (let offset = -window; offset <= window; offset += 1) {
    if (counter + offset < 0) continue;
    const expected = Buffer.from(hotp(secret, counter + offset));
    if (expected.length === candidateBuffer.length && timingSafeEqual(expected, candidateBuffer)) {
      match = true;
    }
  }
  return match;
}

/** URI `otpauth://` : à saisir manuellement ou à convertir en QR code sur le téléphone. */
export function totpUri(input: { secret: string; account: string; issuer?: string }): string {
  const issuer = input.issuer ?? "ORGANIX";
  const label = encodeURIComponent(`${issuer}:${input.account}`);
  const params = new URLSearchParams({
    secret: input.secret,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Groupage lisible (4 caractères) pour la saisie manuelle. */
export function formatSecret(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}
