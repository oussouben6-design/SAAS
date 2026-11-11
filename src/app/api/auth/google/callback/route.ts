import { NextResponse, type NextRequest } from "next/server";
import {
  exchangeCodeForIdToken,
  getGoogleConfig,
  GoogleAuthError,
  safeTokenEqual,
  verifyGoogleIdToken,
} from "@/lib/auth/google";
import {
  LOGIN_OTP_COOKIE,
  MFA_CHALLENGE_COOKIE,
  OAUTH_COOKIE,
  SESSION_COOKIE,
  loginOtpCookieOptions,
  mfaChallengeCookieOptions,
  oauthCookieOptions,
  sessionCookieOptions,
} from "@/lib/auth/cookies";
import { signInWithGoogle } from "@/lib/auth/service";
import { listMemberships } from "@/lib/server/context";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Retour de Google. Chaîne de vérification, dans l'ordre :
 *  1. `state` anti-CSRF (comparé au cookie éphémère, à temps constant) ;
 *  2. échange du code contre le jeton d'identité (secret + PKCE) ;
 *  3. vérification cryptographique du jeton (signature Google, audience, nonce…) ;
 *  4. liaison/ouverture de session via le service d'authentification (MFA incluse).
 * Toute erreur ramène sur /connexion avec un code explicite — jamais de session partielle.
 */
export const dynamic = "force-dynamic";

/** Le défi MFA expire après 5 minutes côté serveur ; le cookie a la même durée. */
const MFA_COOKIE_TTL_SECONDS = 300;
/** Le défi OTP e-mail expire après 10 minutes côté serveur ; le cookie a la même durée. */
const OTP_COOKIE_TTL_SECONDS = 600;

export async function GET(request: NextRequest) {
  const fail = (erreur: string) => {
    const response = NextResponse.redirect(new URL(`/connexion?erreur=${erreur}`, request.url));
    response.cookies.set(OAUTH_COOKIE, "", oauthCookieOptions(0));
    response.cookies.set(LOGIN_OTP_COOKIE, "", loginOtpCookieOptions(0));
    return response;
  };

  const config = getGoogleConfig();
  if (!config) return fail("google_non_configure");

  const params = request.nextUrl.searchParams;
  if (params.get("error")) return fail("google_annule");

  const code = params.get("code");
  const state = params.get("state");
  const cookieRaw = request.cookies.get(OAUTH_COOKIE)?.value;
  if (!code || !state || !cookieRaw) return fail("google_echec");

  let pending: { s?: unknown; n?: unknown; v?: unknown };
  try {
    pending = JSON.parse(cookieRaw) as typeof pending;
  } catch {
    return fail("google_echec");
  }
  if (
    typeof pending.s !== "string" ||
    typeof pending.n !== "string" ||
    typeof pending.v !== "string" ||
    !safeTokenEqual(pending.s, state)
  ) {
    return fail("google_echec");
  }

  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? null;
  const userAgent = request.headers.get("user-agent")?.slice(0, 300) ?? null;
  const limit = rateLimit(`google-callback:${ip ?? "local"}`, 20, 15 * 60);
  if (!limit.allowed) return fail("trop_de_tentatives");

  try {
    const idToken = await exchangeCodeForIdToken(config, code, pending.v);
    const profile = await verifyGoogleIdToken(idToken, {
      clientId: config.clientId,
      nonce: pending.n,
    });

    const result = await signInWithGoogle(profile, { ip, userAgent });
    if (!result.ok) {
      if (result.code === "mfa_required" && result.challenge) {
        const response = NextResponse.redirect(new URL("/connexion", request.url));
        response.cookies.set(OAUTH_COOKIE, "", oauthCookieOptions(0));
        response.cookies.set(
          MFA_CHALLENGE_COOKIE,
          result.challenge,
          mfaChallengeCookieOptions(MFA_COOKIE_TTL_SECONDS),
        );
        return response;
      }
      if (result.code === "login_otp_required" && result.challenge) {
        const response = NextResponse.redirect(new URL("/connexion", request.url));
        response.cookies.set(OAUTH_COOKIE, "", oauthCookieOptions(0));
        response.cookies.set(
          LOGIN_OTP_COOKIE,
          result.challenge,
          loginOtpCookieOptions(OTP_COOKIE_TTL_SECONDS),
        );
        return response;
      }
      if (result.code === "inactive_account") return fail("compte_desactive");
      if (result.code === "registration_disabled") return fail("inscriptions_fermees");
      return fail("google_echec");
    }

    const memberships = await listMemberships(result.data.user.id);
    const response = NextResponse.redirect(
      new URL(memberships.length === 0 ? "/onboarding" : "/app", request.url),
    );
    response.cookies.set(OAUTH_COOKIE, "", oauthCookieOptions(0));
    response.cookies.set(LOGIN_OTP_COOKIE, "", loginOtpCookieOptions(0));
    response.cookies.set(
      SESSION_COOKIE,
      result.data.token,
      sessionCookieOptions(result.data.expiresAt),
    );
    return response;
  } catch (error) {
    if (error instanceof GoogleAuthError) {
      console.error(`[excellence360:auth-google] ${error.code} — ${error.message}`);
      return fail(error.code === "email_not_verified" ? "email_non_verifie" : "google_echec");
    }
    console.error("[excellence360:auth-google] échec inattendu", error);
    return fail("google_echec");
  }
}
