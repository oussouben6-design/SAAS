import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  FolderKanban,
  Lock,
  ShieldCheck,
  Timer,
  Users,
  Wallet,
} from "lucide-react";
import { BrandLogo } from "@/components/layout/auth-shell";
import { APP_COMPANY, APP_NAME, APP_SLOGAN, LOGO_FULL } from "@/lib/brand";
import { getSessionUser } from "@/lib/server/context";
import { Badge } from "@/components/ui/badge";
import { NAVIGATION } from "@/lib/navigation";

export default async function LandingPage() {
  const user = await getSessionUser();

  const modules = NAVIGATION.flatMap((section) => section.items).filter(
    (item) => !["/app/parametres/organisation", "/app/journal"].includes(item.href),
  );

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" aria-label={`${APP_NAME} — accueil`}>
            <BrandLogo />
          </Link>
          <nav className="flex items-center gap-2">
            {user ? (
              <Link
                href="/app"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
              >
                Ouvrir mon espace <ArrowRight className="size-4" />
              </Link>
            ) : (
              <>
                <Link
                  href="/connexion"
                  className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  Se connecter
                </Link>
                <Link
                  href="/inscription"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
                >
                  Créer un compte
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
          <div className="grid gap-10 lg:grid-cols-[1.15fr_1fr] lg:items-center">
            <div className="space-y-6">
              <Image
                src={LOGO_FULL}
                alt={`${APP_NAME} — ${APP_COMPANY}. Plateforme intégrée de gestion, de relation client et de pilotage de la performance.`}
                width={1080}
                height={720}
                priority
                className="w-full max-w-lg rounded-2xl border border-border bg-white shadow-sm"
              />
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1 text-xs font-bold italic text-brand-foreground">
                <Timer className="size-3.5" /> {APP_SLOGAN}
              </span>
              <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
                Toute votre organisation,
                <br />
                dans un seul logiciel.
              </h1>
              <p className="max-w-xl text-base text-muted-foreground">
                {APP_NAME}, par {APP_COMPANY}, réunit les activités administratives, commerciales,
                financières, humaines et opérationnelles. Chaque chiffre affiché provient de votre
                base de données, jamais d&apos;un jeu de démonstration.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href={user ? "/app" : "/inscription"}
                  className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
                >
                  {user ? "Ouvrir mon espace" : "Démarrer avec Excellence 360"} <ArrowRight className="size-4" />
                </Link>
                <Link
                  href="/connexion"
                  className="inline-flex h-11 items-center rounded-lg border border-border px-6 text-sm font-medium hover:bg-muted"
                >
                  J&apos;ai déjà un compte
                </Link>
              </div>
              <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 text-success" /> Permissions vérifiées côté serveur
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 text-success" /> Isolation des organisations (RLS)
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 text-success" /> Journal d&apos;audit
                </li>
              </ul>
            </div>

            <div className="relative">
              <div className="card-surface overflow-hidden">
                <div className="flex items-center gap-1.5 border-b border-border bg-muted/60 px-4 py-2.5">
                  <span className="size-2 rounded-full bg-danger/60" />
                  <span className="size-2 rounded-full bg-warning/60" />
                  <span className="size-2 rounded-full bg-success/60" />
                  <span className="ml-2 text-xs text-muted-foreground">excellence360 · tableau de bord</span>
                </div>
                <div className="grid grid-cols-2 gap-3 p-4">
                  {[
                    { label: "Projets actifs", icon: FolderKanban },
                    { label: "Tâches en retard", icon: ShieldCheck },
                    { label: "Clients", icon: Users },
                    { label: "Trésorerie", icon: Wallet },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg border border-border p-3">
                      <item.icon className="size-4 text-muted-foreground" />
                      <p className="mt-2 text-xs text-muted-foreground">{item.label}</p>
                      <div className="mt-1 h-2 w-full rounded-full bg-muted" />
                      <div className="mt-1.5 h-2 w-2/3 rounded-full bg-muted" />
                    </div>
                  ))}
                </div>
                <div className="border-t border-border p-4">
                  <div className="flex items-end gap-1.5">
                    {[38, 55, 42, 68, 52, 74, 60, 82].map((height, index) => (
                      <div
                        key={index}
                        className="flex-1 rounded-t bg-primary/70"
                        style={{ height: `${height}px` }}
                        aria-hidden
                      />
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Illustration de l&apos;interface — aucune donnée réelle n&apos;est affichée sur cette page.
                  </p>
                </div>
              </div>
              <div className="absolute -bottom-4 -right-2 hidden rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-lg sm:block">
                <span className="flex items-center gap-1.5 font-medium">
                  <Lock className="size-3.5 text-success" /> RLS active sur 46 tables
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-card/50">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <div className="max-w-2xl space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight">Une plateforme modulaire</h2>
              <p className="text-sm text-muted-foreground">
                Activez uniquement les modules utiles. Chaque module possède ses propres tables,
                permissions et règles métier. Les modules non disponibles (assistant IA) sont signalés
                comme tels dans l&apos;application.
              </p>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {modules.map((module) => (
                <div key={module.href} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{module.label}</p>
                    {module.status === "development" ? (
                      <Badge variant="warning">Non disponible</Badge>
                    ) : (
                      <Badge variant="success">Disponible</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{module.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16">
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="space-y-2">
              <ShieldCheck className="size-5 text-primary" />
              <h3 className="font-semibold">Sécurité par conception</h3>
              <p className="text-sm text-muted-foreground">
                Rôles granulaires, permissions vérifiées côté serveur, Row Level Security et journal
                d&apos;audit. La clé de service n&apos;est jamais exposée au navigateur.
              </p>
            </div>
            <div className="space-y-2">
              <BarChart3 className="size-5 text-primary" />
              <h3 className="font-semibold">Décisions fondées sur vos données</h3>
              <p className="text-sm text-muted-foreground">
                Indicateurs, rapports et exports calculés à partir des enregistrements réels de votre
                organisation, avec filtres par période.
              </p>
            </div>
            <div className="space-y-2">
              <Bot className="size-5 text-primary" />
              <h3 className="font-semibold">Évolutif</h3>
              <p className="text-sm text-muted-foreground">
                Architecture monolithe modulaire, prête pour un déploiement SaaS ou privé. Les services
                externes sont remplaçables.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            {APP_NAME} — par {APP_COMPANY}. Plateforme intégrée de gestion, de relation client et
            de pilotage de la performance.
          </p>
          <p>Les modules non finalisés sont signalés dans l&apos;interface.</p>
        </div>
      </footer>
    </div>
  );
}
