import { NextResponse, type NextRequest } from "next/server";
import { createAuthorizationRequest, getGoogleConfig } from "@/lib/auth/google";
import { OAUTH_COOKIE, oauthCookieOptions, readSessionToken } from "@/lib/auth/cookies";
import { validateSession } from "@/lib/auth/service";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Départ du flux « Se connecter avec Google ».
 * Génère state + nonce + PKCE, les conserve 10 minutes dans un cookie httpOnly
 * limité à ce chemin, puis redirige vers le consentement Google.
 */
export const dynamic = "force-dynamic";

const OAUTH_COOKIE_TTL_SECONDS = 600;

export async function GET(request: NextRequest) {
  const loginUrl = (erreur: string) =>
    NextResponse.redirect(new URL(`/connexion?erreur=${erreur}`, request.url));

  const config = getGoogleConfig();
  if (!config) return loginUrl("google_non_configure");

  // Déjà connecté : même comportement que le middleware sur /connexion.
  const token = await readSessionToken();
  if (token && (await validateSession(token))) {
    return NextResponse.redirect(new URL("/app", request.url));
  }

  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "local";
  const limit = rateLimit(`google-start:${ip}`, 20, 15 * 60);
  if (!limit.allowed) return loginUrl("trop_de_tentatives");

  const authRequest = createAuthorizationRequest(config);
  const response = NextResponse.redirect(authRequest.url);
  response.cookies.set(
    OAUTH_COOKIE,
    JSON.stringify({ s: authRequest.state, n: authRequest.nonce, v: authRequest.codeVerifier }),
    oauthCookieOptions(OAUTH_COOKIE_TTL_SECONDS),
  );
  return response;
}
