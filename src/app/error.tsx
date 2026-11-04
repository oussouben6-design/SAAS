"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[organix:ui]", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-danger">Erreur</p>
      <h1 className="text-2xl font-semibold tracking-tight">Une erreur est survenue</h1>
      <p className="text-sm text-muted-foreground">
        L&apos;opération n&apos;a pas abouti. Aucune donnée partielle n&apos;a été enregistrée. Vous pouvez
        réessayer ou revenir à l&apos;accueil.
      </p>
      {error.digest ? <p className="text-xs text-muted-foreground">Référence : {error.digest}</p> : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Réessayer
        </button>
        <Link
          href="/app"
          className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium"
        >
          Retour à l&apos;application
        </Link>
      </div>
    </div>
  );
}
