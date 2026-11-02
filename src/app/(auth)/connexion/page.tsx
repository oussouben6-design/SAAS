import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/layout/auth-shell";
import { getSessionUser } from "@/lib/server/context";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/app");

  return (
    <AuthShell
      title="Connexion"
      subtitle="Accédez à votre espace de travail ORGANIX."
      footer={
        <>
          Pas encore de compte ?{" "}
          <Link href="/inscription" className="font-medium text-primary hover:underline">
            Créer un compte
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
