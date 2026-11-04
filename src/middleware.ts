import { NextResponse, type NextRequest } from "next/server";

/**
 * Première barrière de protection : redirige les visiteurs sans cookie de session.
 * La validation réelle de la session (jeton, expiration, révocation, utilisateur actif)
 * est faite côté serveur dans `src/lib/auth/service.ts` — jamais dans le middleware.
 */

const PROTECTED_PREFIXES = ["/app", "/onboarding"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
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
