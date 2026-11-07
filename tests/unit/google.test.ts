import { generateKeyPairSync, sign as cryptoSign, type KeyObject } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createAuthorizationRequest,
  GoogleAuthError,
  pkceChallenge,
  verifyGoogleIdToken,
  type GoogleConfig,
} from "@/lib/auth/google";

const CONFIG: GoogleConfig = {
  clientId: "1234567890-tests.apps.googleusercontent.com",
  clientSecret: "secret-de-test",
  redirectUri: "http://localhost:3000/api/auth/google/callback",
};

describe("PKCE (RFC 7636)", () => {
  it("retrouve le vecteur de test de la RFC", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("construit une URL d'autorisation complète et cohérente", () => {
    const request = createAuthorizationRequest(CONFIG);
    const url = new URL(request.url);
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe(CONFIG.clientId);
    expect(url.searchParams.get("redirect_uri")).toBe(CONFIG.redirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(pkceChallenge(request.codeVerifier));
    expect(url.searchParams.get("state")).toBe(request.state);
    expect(url.searchParams.get("nonce")).toBe(request.nonce);
    expect(request.state).not.toBe(request.nonce);
    expect(request.state.length).toBeGreaterThanOrEqual(40);
  });
});

// ---------------------------------------------------------------- jeton d'identité

const KID = "cle-de-test-1";
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicJwk = publicKey.export({ format: "jwk" }) as { kty: string; n: string; e: string };

function fakeFetchJwks(): typeof fetch {
  return (async (input: unknown) => {
    const url = String(input);
    if (!url.includes("oauth2/v3/certs")) throw new Error(`URL inattendue : ${url}`);
    return {
      status: 200,
      headers: { get: (name: string) => (name.toLowerCase() === "cache-control" ? "max-age=3600" : null) },
      json: async () => ({ keys: [{ ...publicJwk, kid: KID, alg: "RS256", use: "sig" }] }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

const NOW = 1_760_000_000;

function makeToken(claims: Record<string, unknown>, key: KeyObject = privateKey): string {
  const signingInput = `${b64({ alg: "RS256", kid: KID, typ: "JWT" })}.${b64(claims)}`;
  const signature = cryptoSign("RSA-SHA256", Buffer.from(signingInput), key).toString("base64url");
  return `${signingInput}.${signature}`;
}

function validClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: "https://accounts.google.com",
    aud: CONFIG.clientId,
    sub: "108234567890123456789",
    email: "amina.diallo@gmail.com",
    email_verified: true,
    name: "Amina Diallo",
    nonce: "nonce-de-test",
    iat: NOW - 60,
    exp: NOW + 600,
    ...overrides,
  };
}

const EXPECTED = { clientId: CONFIG.clientId, nonce: "nonce-de-test" };
const OPTIONS = { fetchImpl: fakeFetchJwks(), nowSeconds: NOW };

describe("vérification du jeton d'identité Google", () => {
  it("accepte un jeton correctement signé et extrait le profil", async () => {
    const profile = await verifyGoogleIdToken(makeToken(validClaims()), EXPECTED, OPTIONS);
    expect(profile).toEqual({
      subject: "108234567890123456789",
      email: "amina.diallo@gmail.com",
      emailVerified: true,
      name: "Amina Diallo",
    });
  });

  it("refuse une signature falsifiée", async () => {
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
    await expect(
      verifyGoogleIdToken(makeToken(validClaims(), other.privateKey), EXPECTED, OPTIONS),
    ).rejects.toMatchObject({ code: "invalid_token" });
  });

  it("refuse un jeton expiré", async () => {
    await expect(
      verifyGoogleIdToken(makeToken(validClaims({ exp: NOW - 3600 })), EXPECTED, OPTIONS),
    ).rejects.toMatchObject({ code: "expired_token" });
  });

  it("refuse une audience destinée à une autre application", async () => {
    await expect(
      verifyGoogleIdToken(makeToken(validClaims({ aud: "autre-app" })), EXPECTED, OPTIONS),
    ).rejects.toMatchObject({ code: "audience_mismatch" });
  });

  it("refuse un nonce qui ne correspond pas à la tentative en cours", async () => {
    await expect(
      verifyGoogleIdToken(makeToken(validClaims({ nonce: "autre-nonce" })), EXPECTED, OPTIONS),
    ).rejects.toMatchObject({ code: "nonce_mismatch" });
  });

  it("refuse un émetteur inconnu", async () => {
    await expect(
      verifyGoogleIdToken(makeToken(validClaims({ iss: "https://evil.example.com" })), EXPECTED, OPTIONS),
    ).rejects.toMatchObject({ code: "invalid_token" });
  });

  it("refuse une adresse e-mail non vérifiée par Google", async () => {
    await expect(
      verifyGoogleIdToken(makeToken(validClaims({ email_verified: false })), EXPECTED, OPTIONS),
    ).rejects.toBeInstanceOf(GoogleAuthError);
    await expect(
      verifyGoogleIdToken(makeToken(validClaims({ email_verified: false })), EXPECTED, OPTIONS),
    ).rejects.toMatchObject({ code: "email_not_verified" });
  });

  it("refuse un jeton mal formé", async () => {
    await expect(verifyGoogleIdToken("pas-un-jwt", EXPECTED, OPTIONS)).rejects.toMatchObject({
      code: "invalid_token",
    });
  });
});
