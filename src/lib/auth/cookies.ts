import { cookies } from "next/headers";

export const SESSION_COOKIE = "organix_session";
export const ACTIVE_ORG_COOKIE = "organix_org";

const isProduction = process.env.NODE_ENV === "production";

function baseCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction,
    path: "/",
  };
}

export async function readSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export async function writeSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    ...baseCookieOptions(),
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { ...baseCookieOptions(), maxAge: 0 });
}

export async function readActiveOrgCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(ACTIVE_ORG_COOKIE)?.value ?? null;
}

export async function writeActiveOrgCookie(organizationId: string): Promise<void> {
  const store = await cookies();
  store.set(ACTIVE_ORG_COOKIE, organizationId, {
    ...baseCookieOptions(),
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function clearActiveOrgCookie(): Promise<void> {
  const store = await cookies();
  store.set(ACTIVE_ORG_COOKIE, "", { ...baseCookieOptions(), maxAge: 0 });
}
