import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { AuthShell } from "@/components/layout/auth-shell";
import { getSessionUser } from "@/lib/server/context";
import { isGoogleConfigured } from "@/lib/auth/google";
import { readLoginOtpCookie, readMfaChallengeCookie } from "@/lib/auth/cookies";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion" };

/** Messages affichés après un retour du flux Google (`/api/auth/google/callback`). */
const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  google_non_configure: "La connexion avec Google n'est pas activée sur ce serveur.",
  google_annule: "Connexion Google annulée.",
  google_echec: "La connexion avec Google a échoué. Réessayez ou utilisez votre mot de passe.",
  email_non_verifie:
    "Google n'a pas confirmé la propriété de cette adresse e-mail : connexion refusée.",
  compte_desactive: "Ce compte est désactivé. Contactez un administrateur.",
  inscriptions_fermees:
    "La création de compte est désactivée. Demandez une invitation à votre administrateur.",
  trop_de_tentatives: "Trop de tentatives. Réessayez dans quelques minutes.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/app");

  const { erreur } = await searchParams;
  const errorMessage = erreur ? GOOGLE_ERROR_MESSAGES[erreur] : undefined;
  const mfaChallenge = await readMfaChallengeCookie();
  const otpChallenge = await readLoginOtpCookie();

  return (
    <AuthShell
      title="Connexion"
      subtitle="Accédez à votre espace de travail Excellence 360 CRM."
      footer={
        <>
          Pas encore de compte ?{" "}
          <Link href="/inscription" className="font-medium text-primary hover:underline">
            Créer un compte
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        {errorMessage ? (
          <p
            role="alert"
            className="flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger"
          >
            <AlertCircle className="size-4 shrink-0" /> {errorMessage}
          </p>
        ) : null}
        <LoginForm
          googleEnabled={isGoogleConfigured()}
          initialChallenge={mfaChallenge ?? undefined}
          initialOtpChallenge={otpChallenge ?? undefined}
        />
      </div>
    </AuthShell>
  );
}
