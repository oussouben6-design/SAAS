import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify as cryptoVerify, type KeyObject } from "node:crypto";
import { appBaseUrl } from "@/lib/mail";

/**
 * Connexion avec Google — OAuth 2.0 + OpenID Connect, sans dépendance externe.
 *
 * Flux « Authorization Code » renforcé :
 *  - PKCE (S256) : le code d'autorisation intercepté est inutilisable sans le `code_verifier` ;
 *  - `state` : protection CSRF sur le retour (callback) ;
 *  - `nonce` : lie le jeton d'identité à cette tentative précise (anti-rejeu) ;
 *  - vérification complète du jeton d'identité : signature RS256 contre les clés
 *    publiques Google (JWKS), émetteur, audience, expiration, `email_verified`.
 *
 * Activation par variables d'environnement : GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET
 * (console Google Cloud → Identifiants OAuth « Application Web »). L'URI de redirection
 * à déclarer chez Google est `<APP_URL>/api/auth/google/callback`.
 * Voir docs/configuration.md.
 */

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const CLOCK_SKEW_SECONDS = 300;
const FETCH_TIMEOUT_MS = 10_000;

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GoogleProfile {
  /** Identifiant stable du compte Google (`sub`). Ne change jamais, même si l'e-mail change. */
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

export type GoogleErrorCode =
  | "not_configured"
  | "exchange_failed"
  | "invalid_token"
  | "expired_token"
  | "audience_mismatch"
  | "nonce_mismatch"
  | "email_not_verified"
  | "network_error";

export class GoogleAuthError extends Error {
  readonly code: GoogleErrorCode;

  constructor(code: GoogleErrorCode, message: string) {
    super(message);
    this.name = "GoogleAuthError";
    this.code = code;
  }
}

export function getGoogleConfig(env: NodeJS.ProcessEnv = process.env): GoogleConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    redirectUri: `${appBaseUrl()}/api/auth/google/callback`,
  };
}

export function isGoogleConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return getGoogleConfig(env) !== null;
}

function base64UrlEncode(data: Buffer): string {
  return data.toString("base64url");
}

/** Empreinte PKCE `S256` : base64url(sha256(verifier)) — RFC 7636. */
export function pkceChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier, "utf8").digest("base64url");
}

export interface AuthorizationRequest {
  url: string;
  state: string;
  nonce: string;
  codeVerifier: string;
}

export function createAuthorizationRequest(config: GoogleConfig): AuthorizationRequest {
  const state = base64UrlEncode(randomBytes(32));
  const nonce = base64UrlEncode(randomBytes(32));
  const codeVerifier = base64UrlEncode(randomBytes(64));

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: pkceChallenge(codeVerifier),
    code_challenge_method: "S256",
    access_type: "online",
    prompt: "select_account",
  });

  return { url: `${GOOGLE_AUTH_URL}?${params.toString()}`, state, nonce, codeVerifier };
}

/** Comparaison à temps constant des jetons anti-CSRF (`state`). */
export function safeTokenEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

type FetchImpl = typeof fetch;

async function fetchJson(
  fetchImpl: FetchImpl,
  url: string,
  init?: RequestInit,
): Promise<{ status: number; body: unknown; headers: Headers }> {
  let response: Response;
  try {
    response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (error) {
    throw new GoogleAuthError("network_error", `Google injoignable (${url}) : ${(error as Error).message}`);
  }
  const body = (await response.json().catch(() => null)) as unknown;
  return { status: response.status, body, headers: response.headers };
}

/** Échange le code d'autorisation contre les jetons ; renvoie le jeton d'identité (JWT). */
export async function exchangeCodeForIdToken(
  config: GoogleConfig,
  code: string,
  codeVerifier: string,
  fetchImpl: FetchImpl = fetch,
): Promise<string> {
  const form = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });

  const { status, body } = await fetchJson(fetchImpl, GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const payload = (body ?? {}) as { id_token?: unknown; error?: unknown; error_description?: unknown };
  if (status !== 200 || typeof payload.id_token !== "string") {
    const detail = typeof payload.error === "string" ? payload.error : `HTTP ${status}`;
    throw new GoogleAuthError("exchange_failed", `Échange du code refusé par Google (${detail}).`);
  }
  return payload.id_token;
}

// ---------------------------------------------------------- vérification du jeton d'identité

interface JwkRsa {
  kty: string;
  kid?: string;
  n: string;
  e: string;
  alg?: string;
  use?: string;
}

const jwksCache = new Map<string, { key: KeyObject; expiresAt: number }>();

async function loadGoogleKeys(fetchImpl: FetchImpl): Promise<void> {
  const { status, body, headers } = await fetchJson(fetchImpl, GOOGLE_JWKS_URL);
  if (status !== 200 || typeof body !== "object" || body === null) {
    throw new GoogleAuthError("network_error", `Clés publiques Google inaccessibles (HTTP ${status}).`);
  }
  const keys = (body as { keys?: unknown }).keys;
  if (!Array.isArray(keys)) {
    throw new GoogleAuthError("network_error", "Réponse JWKS Google inattendue.");
  }

  const cacheControl = headers.get("cache-control") ?? "";
  const maxAge = /max-age=(\d+)/.exec(cacheControl);
  const ttlSeconds = maxAge ? Math.min(Number(maxAge[1]), 24 * 3600) : 3600;
  const expiresAt = Date.now() + ttlSeconds * 1000;

  for (const raw of keys as JwkRsa[]) {
    if (raw.kty !== "RSA" || typeof raw.kid !== "string" || !raw.n || !raw.e) continue;
    try {
      const key = createPublicKey({
        key: { kty: "RSA", n: raw.n, e: raw.e },
        format: "jwk",
      });
      jwksCache.set(raw.kid, { key, expiresAt });
    } catch {
      // Clé inutilisable ignorée : les autres clés restent disponibles.
    }
  }
}

async function getGoogleKey(kid: string, fetchImpl: FetchImpl): Promise<KeyObject> {
  const cached = jwksCache.get(kid);
  if (cached && cached.expiresAt > Date.now()) return cached.key;
  await loadGoogleKeys(fetchImpl);
  const fresh = jwksCache.get(kid);
  if (!fresh) {
    throw new GoogleAuthError("invalid_token", `Clé de signature Google inconnue (kid ${kid}).`);
  }
  return fresh.key;
}

function decodeSegment<T>(segment: string, label: string): T {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T;
  } catch {
    throw new GoogleAuthError("invalid_token", `Jeton d'identité illisible (${label}).`);
  }
}

interface IdTokenClaims {
  iss?: unknown;
  aud?: unknown;
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
  nonce?: unknown;
  exp?: unknown;
  iat?: unknown;
}

/**
 * Vérifie un jeton d'identité Google et en extrait le profil.
 * `nowSeconds` et `fetchImpl` sont injectables pour les tests.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  expected: { clientId: string; nonce: string },
  options: { fetchImpl?: FetchImpl; nowSeconds?: number } = {},
): Promise<GoogleProfile> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);

  const segments = idToken.split(".");
  if (segments.length !== 3) {
    throw new GoogleAuthError("invalid_token", "Jeton d'identité mal formé (3 segments attendus).");
  }
  const [encodedHeader, encodedClaims, encodedSignature] = segments as [string, string, string];

  const header = decodeSegment<{ alg?: unknown; kid?: unknown }>(encodedHeader, "en-tête");
  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    throw new GoogleAuthError("invalid_token", "En-tête du jeton inattendu (alg RS256 et kid requis).");
  }

  const key = await getGoogleKey(header.kid, fetchImpl);
  const signingInput = Buffer.from(`${encodedHeader}.${encodedClaims}`, "utf8");
  const signature = Buffer.from(encodedSignature, "base64url");
  if (!cryptoVerify("RSA-SHA256", signingInput, key, signature)) {
    throw new GoogleAuthError("invalid_token", "Signature du jeton d'identité invalide.");
  }

  const claims = decodeSegment<IdTokenClaims>(encodedClaims, "contenu");

  if (typeof claims.iss !== "string" || !GOOGLE_ISSUERS.has(claims.iss)) {
    throw new GoogleAuthError("invalid_token", "Émetteur du jeton inattendu.");
  }
  if (claims.aud !== expected.clientId) {
    throw new GoogleAuthError("audience_mismatch", "Le jeton n'est pas destiné à cette application (aud).");
  }
  if (typeof claims.exp !== "number" || now > claims.exp + CLOCK_SKEW_SECONDS) {
    throw new GoogleAuthError("expired_token", "Jeton d'identité expiré.");
  }
  if (typeof claims.iat === "number" && claims.iat > now + CLOCK_SKEW_SECONDS) {
    throw new GoogleAuthError("invalid_token", "Jeton d'identité émis dans le futur.");
  }
  if (claims.nonce !== expected.nonce) {
    throw new GoogleAuthError("nonce_mismatch", "Le nonce du jeton ne correspond pas à cette connexion.");
  }
  if (typeof claims.sub !== "string" || claims.sub.length === 0) {
    throw new GoogleAuthError("invalid_token", "Identifiant Google (sub) absent.");
  }
  if (typeof claims.email !== "string" || !claims.email.includes("@")) {
    throw new GoogleAuthError("invalid_token", "Adresse e-mail absente du jeton Google.");
  }
  const emailVerified = claims.email_verified === true || claims.email_verified === "true";
  if (!emailVerified) {
    throw new GoogleAuthError(
      "email_not_verified",
      "Google n'a pas vérifié cette adresse e-mail : connexion refusée.",
    );
  }

  return {
    subject: claims.sub,
    email: claims.email,
    emailVerified,
    name: typeof claims.name === "string" && claims.name.trim() ? claims.name.trim() : null,
  };
}
