import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/layout/auth-shell";
import { ForgotPasswordForm } from "./forgot-form";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Mot de passe oublié"
      subtitle="Saisissez votre adresse e-mail pour recevoir un lien de réinitialisation."
      footer={
        <Link href="/connexion" className="font-medium text-primary hover:underline">
          ← Retour à la connexion
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
