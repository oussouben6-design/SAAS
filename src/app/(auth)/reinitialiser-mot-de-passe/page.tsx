import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/layout/auth-shell";
import { ResetPasswordForm } from "./reset-form";

export const metadata: Metadata = { title: "Réinitialiser le mot de passe" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <AuthShell
      title="Réinitialiser le mot de passe"
      subtitle="Choisissez un nouveau mot de passe pour votre compte."
      footer={
        <Link href="/connexion" className="font-medium text-primary hover:underline">
          ← Retour à la connexion
        </Link>
      }
    >
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <p className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          Lien invalide : le jeton de réinitialisation est absent. Recommencez la procédure depuis la
          page « Mot de passe oublié ».
        </p>
      )}
    </AuthShell>
  );
}
