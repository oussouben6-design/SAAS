import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-primary">Erreur 404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Page introuvable</h1>
      <p className="text-sm text-muted-foreground">
        La page demandée n&apos;existe pas ou la ressource a été supprimée.
      </p>
      <Link
        href="/app"
        className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        Retour à l&apos;espace de travail
      </Link>
    </div>
  );
}
