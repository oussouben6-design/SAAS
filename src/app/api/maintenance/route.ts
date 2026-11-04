import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { cleanupExpiredAuthRecords } from "@/lib/auth/service";
import { closeDb } from "@/lib/db";

/**
 * Maintenance planifiée, déclenchable par un cron externe (GitHub Actions, cron-job.org,
 * Netlify Scheduled Function…).
 *
 * Protégée par `MAINTENANCE_SECRET` (en-tête `Authorization: Bearer <secret>` ou `?token=`).
 * Sans secret configuré, la route répond 503 : elle ne doit jamais être ouverte par défaut.
 * Opération effectuée : purge des sessions expirées et des jetons d'action périmés.
 * Aucune donnée métier n'est supprimée.
 */
export const dynamic = "force-dynamic";

function authorized(request: NextRequest, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const query = request.nextUrl.searchParams.get("token") ?? "";
  const provided = bearer || query;
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function run(request: NextRequest) {
  const secret = process.env.MAINTENANCE_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      {
        status: "disabled",
        message:
          "MAINTENANCE_SECRET n'est pas configurée : la maintenance planifiée est désactivée.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!authorized(request, secret)) {
    return NextResponse.json(
      { status: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const startedAt = Date.now();
  try {
    await cleanupExpiredAuthRecords();
    // Sur les plateformes serverless, la connexion est courte : on la referme explicitement
    // pour ne pas saturer le pooler (Supabase).
    await closeDb().catch(() => {});
    return NextResponse.json(
      { status: "ok", task: "purge-sessions", durationMs: Date.now() - startedAt },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[excellence360:maintenance] échec", error);
    await closeDb().catch(() => {});
    return NextResponse.json(
      { status: "error", message: "Purge impossible : voir les journaux du serveur." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
