import Image from "next/image";
import Link from "next/link";
import { ShieldCheck, Workflow, BarChart3 } from "lucide-react";
import { APP_COMPANY, APP_SLOGAN, LOGO_EMBLEM } from "@/lib/brand";

export function BrandMark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dimensions = size === "sm" ? "size-8" : size === "lg" ? "size-11" : "size-9";
  return (
    <Image
      src={LOGO_EMBLEM}
      alt={`Emblème ${APP_COMPANY}`}
      width={96}
      height={96}
      className={`${dimensions} shrink-0 rounded-full bg-white object-contain shadow-sm`}
      priority
    />
  );
}

/** Logo horizontal : emblème + « Excellence 360 » et pastille « CRM », comme sur le logo officiel. */
export function BrandLogo({ onDark = false }: { onDark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <BrandMark />
      <span
        className={`text-lg font-extrabold italic tracking-tight ${onDark ? "text-white" : "text-navy"}`}
      >
        Excellence <span className="text-primary">360</span>
      </span>
      <span
        className={`rounded-md px-1.5 py-0.5 text-xs font-extrabold italic tracking-wide ${
          onDark ? "bg-brand text-brand-foreground" : "bg-navy text-white"
        }`}
      >
        CRM
      </span>
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
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            background:
              "radial-gradient(60% 60% at 20% 10%, rgb(0 87 168 / 0.65) 0%, transparent 70%), radial-gradient(50% 50% at 90% 80%, rgb(0 139 223 / 0.45) 0%, transparent 70%), radial-gradient(35% 35% at 85% 15%, rgb(255 192 0 / 0.22) 0%, transparent 70%)",
          }}
        />
        <div className="relative">
          <Link href="/" className="inline-block" aria-label="Excellence 360 CRM — accueil">
            <BrandLogo onDark />
          </Link>
          <p className="mt-10 max-w-sm text-2xl font-semibold leading-snug">
            Pilotez votre organisation depuis une plateforme unique.
          </p>
          <p className="mt-3 max-w-sm text-sm text-sidebar-muted">
            Plateforme intégrée de gestion, de relation client et de pilotage de la performance :
            activités administratives, commerciales, financières et humaines réunies dans un seul
            logiciel.
          </p>
          <p className="mt-5 inline-flex rounded-full bg-brand px-3 py-1 text-xs font-bold italic text-brand-foreground">
            {APP_SLOGAN}
          </p>
          <ul className="mt-10 space-y-4 text-sm">
            <li className="flex items-start gap-3">
              <Workflow className="mt-0.5 size-4 text-brand" />
              <span>
                <span className="font-medium">Modules configurables</span>
                <br />
                <span className="text-sidebar-muted">Activez uniquement ce dont votre équipe a besoin.</span>
              </span>
            </li>
            <li className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-4 text-brand" />
              <span>
                <span className="font-medium">Permissions vérifiées côté serveur</span>
                <br />
                <span className="text-sidebar-muted">
                  Rôles granulaires et isolation des organisations par RLS.
                </span>
              </span>
            </li>
            <li className="flex items-start gap-3">
              <BarChart3 className="mt-0.5 size-4 text-brand" />
              <span>
                <span className="font-medium">Indicateurs issus de vos données</span>
                <br />
                <span className="text-sidebar-muted">Aucune donnée de démonstration masquée.</span>
              </span>
            </li>
          </ul>
        </div>
        <p className="relative text-xs text-sidebar-muted">
          Excellence 360 CRM — par {APP_COMPANY}. Les modules non disponibles sont signalés comme
          tels.
        </p>
      </div>

      <div className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md space-y-6">
          <div className="lg:hidden">
            <Link href="/" aria-label="Excellence 360 CRM — accueil">
              <BrandLogo />
            </Link>
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
