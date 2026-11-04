import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  formatSecret,
  generateTotpSecret,
  hotp,
  totp,
  totpUri,
  verifyTotp,
} from "@/lib/auth/totp";

// Vecteurs de test de la RFC 6238 (SHA-1), secret ASCII "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP (RFC 6238)", () => {
  it("retrouve les codes de référence de la RFC", () => {
    const cases: Array<[number, string]> = [
      [59, "287082"],
      [1111111109, "081804"],
      [1111111111, "050471"],
      [1234567890, "005924"],
      [2000000000, "279037"],
      [20000000000, "353130"],
    ];
    for (const [seconds, expected] of cases) {
      expect(totp(RFC_SECRET, seconds * 1000)).toBe(expected);
    }
  });

  it("encode et décode le base32 dans les deux sens", () => {
    const bytes = Buffer.from("12345678901234567890");
    expect(base32Encode(bytes)).toBe(RFC_SECRET);
    expect(base32Decode(RFC_SECRET).toString()).toBe("12345678901234567890");
    expect(() => base32Decode("0189")).toThrow(/base32/);
  });

  it("accepte une dérive d'un pas de temps et refuse au-delà", () => {
    const at = 1_700_000_000_000;
    const previous = hotp(RFC_SECRET, Math.floor(at / 30_000) - 1);
    const tooOld = hotp(RFC_SECRET, Math.floor(at / 30_000) - 3);
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, at), { at })).toBe(true);
    expect(verifyTotp(RFC_SECRET, previous, { at })).toBe(true);
    expect(verifyTotp(RFC_SECRET, tooOld, { at })).toBe(false);
    expect(verifyTotp(RFC_SECRET, "12345", { at })).toBe(false);
    expect(verifyTotp(RFC_SECRET, "abcdef", { at })).toBe(false);
  });

  it("produit un secret de 32 caractères base32 et une URI otpauth correcte", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(formatSecret(secret)).toHaveLength(32 + 7);
    const uri = new URL(totpUri({ secret, account: "admin@exemple.com" }));
    expect(uri.protocol).toBe("otpauth:");
    expect(uri.searchParams.get("secret")).toBe(secret);
    expect(uri.searchParams.get("issuer")).toBe("Excellence 360 CRM");
    expect(uri.searchParams.get("period")).toBe("30");
    expect(decodeURIComponent(uri.pathname)).toBe("/Excellence 360 CRM:admin@exemple.com");
  });
});
