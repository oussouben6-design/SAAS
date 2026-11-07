import { readdir } from "node:fs/promises";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { MIGRATIONS_PATH } from "@/lib/db/client";

/**
 * Sonde de disponibilité (monitoring, orchestrateurs).
 * Aucune donnée métier ni secret n'est exposé : état, moteur, version et état des migrations.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    const db = await getDb();
    const info = await db.privileged(async (tx) => {
      const ping = await tx.query<{ now: string }>("select now()::text as now");
      const migrations = await tx.query<{ count: number }>(
        "select count(*)::int as count from app.migrations",
      );
      return { now: ping[0]?.now ?? null, applied: migrations[0]?.count ?? 0 };
    });
    const available = (await readdir(MIGRATIONS_PATH)).filter((file) => file.endsWith(".sql")).length;
    const healthy = info.applied === available;

    return NextResponse.json(
      {
        status: healthy ? "ok" : "degraded",
        driver: db.driver,
        migrations: { applied: info.applied, available },
        databaseTime: info.now,
        latencyMs: Date.now() - startedAt,
        version: process.env.npm_package_version ?? "0.1.0",
      },
      { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[excellence360:health] indisponible", error);
    return NextResponse.json(
      { status: "error", message: "Base de données indisponible." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
