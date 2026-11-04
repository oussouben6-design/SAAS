import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/server/context";
import { can } from "@/lib/server/context";
import { getDocumentForDownload } from "@/modules/documents/service";
import { AppError } from "@/lib/server/errors";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAppContext();
  if (!context || !context.organization) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  if (!can(context, "documents", "read")) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const { id } = await params;
  try {
    const file = await getDocumentForDownload(
      { userId: context.user.id, organizationId: context.organization.id },
      id,
    );
    return new NextResponse(new Uint8Array(file.buffer), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(file.name)}"`,
        "Content-Length": String(file.buffer.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[excellence360:documents]", error);
    return NextResponse.json({ error: "Erreur interne." }, { status: 500 });
  }
}
