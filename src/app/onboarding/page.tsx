import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser, listMemberships } from "@/lib/server/context";
import { OnboardingForm } from "./onboarding-form";
import { BrandLogo } from "@/components/layout/auth-shell";
import { logoutAction } from "../(auth)/actions";

export const metadata: Metadata = {
  title: "Créer votre organisation",
  robots: { index: false, follow: false },
};

export default async function OnboardingPage() {
  const user = await requireUser();
  const memberships = await listMemberships(user.id);
  if (memberships.length > 0) redirect("/app");

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-8 px-5 py-12">
      <div className="flex items-center justify-between">
        <BrandLogo />
        <form action={logoutAction}>
          <button type="submit" className="text-sm text-muted-foreground hover:text-foreground">
            Se déconnecter
          </button>
        </form>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Étape 1 sur 1</p>
        <h1 className="text-2xl font-semibold tracking-tight">Configurez votre organisation</h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          Bonjour {user.fullName}. Ces informations déterminent le fonctionnement de base de votre
          espace : devise, fuseau horaire et langue. Elles restent modifiables à tout moment.
        </p>
      </div>

      <div className="card-surface p-6">
        <OnboardingForm />
      </div>

      <p className="text-xs text-muted-foreground">
        Vous rejoignez une organisation existante ? Demandez une invitation à son administrateur :
        aucune donnée ne sera créée tant que vous n&apos;aurez pas terminé cette étape.
      </p>
    </div>
  );
}
