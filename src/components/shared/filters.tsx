import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FilterBar({
  action,
  q,
  placeholder = "Rechercher…",
  children,
  hidden = {},
}: {
  action: string;
  q?: string;
  placeholder?: string;
  children?: React.ReactNode;
  hidden?: Record<string, string | undefined>;
}) {
  return (
    <form action={action} method="get" className="flex flex-wrap items-end gap-2">
      {Object.entries(hidden).map(([key, value]) =>
        value ? <input key={key} type="hidden" name={key} value={value} /> : null,
      )}
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={placeholder}
          className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm"
          aria-label={placeholder}
        />
      </div>
      {children}
      <Button type="submit" variant="outline" size="default">
        Filtrer
      </Button>
    </form>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  basePath,
  params,
}: {
  page: number;
  totalPages: number;
  total: number;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  const buildHref = (target: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value);
    }
    search.set("page", String(target));
    return `${basePath}?${search.toString()}`;
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-sm">
      <p className="text-muted-foreground">
        {total} résultat{total > 1 ? "s" : ""} · page {page} sur {totalPages}
      </p>
      <div className="flex gap-2">
        <PageLink href={buildHref(page - 1)} disabled={page <= 1} label="Précédent" />
        <PageLink href={buildHref(page + 1)} disabled={page >= totalPages} label="Suivant" />
      </div>
    </div>
  );
}

function PageLink({ href, disabled, label }: { href: string; disabled: boolean; label: string }) {
  if (disabled) {
    return (
      <span className="cursor-not-allowed rounded-lg border border-border px-3 py-1.5 text-muted-foreground opacity-50">
        {label}
      </span>
    );
  }
  return (
    <Link href={href} className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted">
      {label}
    </Link>
  );
}

const TONES: Record<string, { className: string; label?: string }> = {
  active: { className: "bg-success-soft text-success", label: "Actif" },
  inactive: { className: "bg-muted text-muted-foreground", label: "Inactif" },
  archived: { className: "bg-muted text-muted-foreground", label: "Archivé" },
  planning: { className: "bg-accent text-accent-foreground", label: "Planification" },
  on_hold: { className: "bg-warning-soft text-warning", label: "En pause" },
  completed: { className: "bg-success-soft text-success", label: "Terminé" },
  cancelled: { className: "bg-muted text-muted-foreground", label: "Annulé" },
  todo: { className: "bg-muted text-muted-foreground", label: "À faire" },
  in_progress: { className: "bg-accent text-accent-foreground", label: "En cours" },
  review: { className: "bg-warning-soft text-warning", label: "En revue" },
  done: { className: "bg-success-soft text-success", label: "Terminée" },
  blocked: { className: "bg-danger-soft text-danger", label: "Bloquée" },
  new: { className: "bg-accent text-accent-foreground", label: "Nouveau" },
  contacted: { className: "bg-warning-soft text-warning", label: "Contacté" },
  qualified: { className: "bg-success-soft text-success", label: "Qualifié" },
  unqualified: { className: "bg-muted text-muted-foreground", label: "Non qualifié" },
  converted: { className: "bg-success-soft text-success", label: "Converti" },
  pending: { className: "bg-warning-soft text-warning", label: "En attente" },
  approved: { className: "bg-success-soft text-success", label: "Approuvé" },
  rejected: { className: "bg-danger-soft text-danger", label: "Rejeté" },
  suspended: { className: "bg-danger-soft text-danger", label: "Suspendu" },
  invited: { className: "bg-accent text-accent-foreground", label: "Invité" },
  draft: { className: "bg-muted text-muted-foreground", label: "Brouillon" },
  sent: { className: "bg-accent text-accent-foreground", label: "Envoyé" },
  partial: { className: "bg-warning-soft text-warning", label: "Partiel" },
  paid: { className: "bg-success-soft text-success", label: "Payé" },
  overdue: { className: "bg-danger-soft text-danger", label: "En retard" },
  accepted: { className: "bg-success-soft text-success", label: "Accepté" },
  expired: { className: "bg-muted text-muted-foreground", label: "Expiré" },
  present: { className: "bg-success-soft text-success", label: "Présent" },
  late: { className: "bg-warning-soft text-warning", label: "En retard" },
  leave: { className: "bg-accent text-accent-foreground", label: "Congé" },
  remote: { className: "bg-accent text-accent-foreground", label: "Télétravail" },
  absent: { className: "bg-danger-soft text-danger", label: "Absent" },
};

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  const tone = TONES[status] ?? { className: "bg-muted text-muted-foreground" };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        tone.className,
        className,
      )}
    >
      {label ?? tone.label ?? status}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, { className: string; label: string }> = {
    low: { className: "bg-muted text-muted-foreground", label: "Basse" },
    medium: { className: "bg-accent text-accent-foreground", label: "Moyenne" },
    high: { className: "bg-warning-soft text-warning", label: "Haute" },
    critical: { className: "bg-danger-soft text-danger", label: "Critique" },
  };
  const tone = map[priority] ?? map.medium!;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tone.className)}>
      {tone.label}
    </span>
  );
}
