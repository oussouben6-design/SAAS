import { NextResponse } from "next/server";
import { listMemberships } from "@/lib/server/context";
import { getSessionUser } from "@/lib/server/context";
import { writeActiveOrgCookie } from "@/lib/auth/cookies";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.redirect(new URL("/connexion", request.url), { status: 303 });
  }

  const formData = await request.formData();
  const organizationId = String(formData.get("organizationId") ?? "");
  const memberships = await listMemberships(user.id);

  if (!memberships.some((membership) => membership.organization_id === organizationId)) {
    return NextResponse.redirect(new URL("/app", request.url), { status: 303 });
  }

  await writeActiveOrgCookie(organizationId);
  return NextResponse.redirect(new URL("/app", request.url), { status: 303 });
}
