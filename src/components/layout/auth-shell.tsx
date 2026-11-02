import Link from "next/link";
import { ShieldCheck, Workflow, BarChart3 } from "lucide-react";

export function BrandMark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dimensions = size === "sm" ? "size-8 text-sm" : size === "lg" ? "size-11 text-lg" : "size-9 text-base";
  return (
    <span
      className={`inline-flex ${dimensions} items-center justify-center rounded-xl bg-primary font-bold text-primary-foreground shadow-sm`}
      aria-hidden
    >
      O
    </span>
  );
}

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(60% 60% at 20% 10%, oklch(0.45 0.16 258 / 0.55) 0%, transparent 70%), radial-gradient(50% 50% at 90% 80%, oklch(0.4 0.12 200 / 0.4) 0%, transparent 70%)",
          }}
        />
        <div className="relative">
          <Link href="/" className="flex items-center gap-3">
            <BrandMark />
            <span className="text-lg font-semibold tracking-tight">ORGANIX</span>
          </Link>
          <p className="mt-10 max-w-sm text-2xl font-semibold leading-snug">
            Pilotez votre organisation depuis une plateforme unique.
          </p>
          <p className="mt-3 max-w-sm text-sm text-sidebar-muted">
            Activités administratives, commerciales, financières, humaines et opérationnelles
            réunies dans un seul logiciel.
          </p>
          <ul className="mt-10 space-y-4 text-sm">
            <li className="flex items-start gap-3">
              <Workflow className="mt-0.5 size-4 text-sidebar-foreground" />
              <span>
                <span className="font-medium">Modules configurables</span>
                <br />
                <span className="text-sidebar-muted">Activez uniquement ce dont votre équipe a besoin.</span>
              </span>
            </li>
            <li className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-4 text-sidebar-foreground" />
              <span>
                <span className="font-medium">Permissions vérifiées côté serveur</span>
                <br />
                <span className="text-sidebar-muted">
                  Rôles granulaires et isolation des organisations par RLS.
                </span>
              </span>
            </li>
            <li className="flex items-start gap-3">
              <BarChart3 className="mt-0.5 size-4 text-sidebar-foreground" />
              <span>
                <span className="font-medium">Indicateurs issus de vos données</span>
                <br />
                <span className="text-sidebar-muted">Aucune donnée de démonstration masquée.</span>
              </span>
            </li>
          </ul>
        </div>
        <p className="relative text-xs text-sidebar-muted">
          ORGANIX — version pilote. Les modules non finalisés sont signalés « En développement ».
        </p>
      </div>

      <div className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md space-y-6">
          <div className="flex items-center gap-3 lg:hidden">
            <BrandMark />
            <span className="text-lg font-semibold tracking-tight">ORGANIX</span>
          </div>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
          {children}
          {footer ? <div className="text-sm text-muted-foreground">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}
