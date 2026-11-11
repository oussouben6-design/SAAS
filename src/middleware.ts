import { NextResponse, type NextRequest } from "next/server";

/**
 * Première barrière de protection : redirige les visiteurs sans cookie de session.
 * La validation réelle de la session (jeton, expiration, révocation, utilisateur actif)
 * est faite côté serveur dans `src/lib/auth/service.ts` — jamais dans le middleware.
 */

const PROTECTED_PREFIXES = ["/app", "/onboarding"];
const AUTH_PAGES = new Set([
  "/connexion",
  "/inscription",
  "/mot-de-passe-oublie",
  "/reinitialiser-mot-de-passe",
  "/verifier-email",
]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Mode personnel (PERSONAL_MODE=true au build) : aucun cookie requis — tout
  // le site ouvre sur l’application. Voir docs/mode-personnel.md.
  if (process.env.PERSONAL_MODE === "true") {
    if (AUTH_PAGES.has(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/app";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }
  const hasSession = Boolean(request.cookies.get("organix_session")?.value);

  if (!hasSession && PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (hasSession && (pathname === "/connexion" || pathname === "/inscription")) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/onboarding", "/connexion", "/inscription"],
};
