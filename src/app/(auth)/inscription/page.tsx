import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/layout/auth-shell";
import { getSessionUser } from "@/lib/server/context";
import { isGoogleConfigured } from "@/lib/auth/google";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Créer un compte" };

export default async function RegisterPage() {
  const user = await getSessionUser();
  if (user) redirect("/app");
  const registrationDisabled = process.env.AUTH_ALLOW_REGISTRATION === "false";

  return (
    <AuthShell
      title="Créer un compte"
      subtitle="La création d'un compte vous permet de configurer votre organisation."
      footer={
        <>
          Vous avez déjà un compte ?{" "}
          <Link href="/connexion" className="font-medium text-primary hover:underline">
            Se connecter
          </Link>
        </>
      }
    >
      {registrationDisabled ? (
        <p className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          La création libre de compte est désactivée. Demandez une invitation à l&apos;administrateur
          de votre organisation.
        </p>
      ) : (
        <RegisterForm googleEnabled={isGoogleConfigured()} />
      )}
    </AuthShell>
  );
}
