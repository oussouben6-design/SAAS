import type { Metadata } from "next";
import Link from "next/link";
import { Search as SearchIcon } from "lucide-react";
import { requireContext } from "@/lib/server/context";
import { globalSearch } from "@/modules/search/service";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Recherche" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const context = await requireContext();
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const results = query.length >= 2 ? await globalSearch(context, query) : [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Recherche"
        description={
          query
            ? `Résultats pour « ${query} » — seuls les modules auxquels vous avez accès sont interrogés.`
            : "Saisissez au moins deux caractères pour lancer une recherche."
        }
      />

      <Card>
        <CardContent className="p-4">
          <form action="/app/recherche" method="get" className="flex gap-2">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                name="q"
                defaultValue={query}
                placeholder="Client, projet, employé, facture, partenaire…"
                className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm"
                aria-label="Rechercher"
                autoFocus
              />
            </div>
            <button
              type="submit"
              className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
            >
              Rechercher
            </button>
          </form>
        </CardContent>
      </Card>

      {query.length < 2 ? null : results.length === 0 ? (
        <EmptyState
          icon={<SearchIcon />}
          title="Aucun résultat"
          description="Essayez un autre terme ou vérifiez que vous disposez des permissions nécessaires sur le module concerné."
        />
      ) : (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {results.map((hit) => (
              <Link
                key={`${hit.type}-${hit.id}`}
                href={hit.href}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{hit.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{hit.subtitle ?? "—"}</span>
                </span>
                <Badge variant="outline">{hit.badge ?? hit.type}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
