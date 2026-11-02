import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/layout/auth-shell";
import { verifyEmailToken } from "@/lib/auth/service";
import { Alert } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Vérification de l'e-mail" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const result = token ? await verifyEmailToken(token) : null;

  return (
    <AuthShell
      title="Vérification de l'adresse e-mail"
      footer={
        <Link href="/connexion" className="font-medium text-primary hover:underline">
          Aller à la connexion
        </Link>
      }
    >
      {!token ? (
        <Alert variant="danger" title="Lien invalide">
          Aucun jeton de vérification n&apos;a été fourni.
        </Alert>
      ) : result?.ok ? (
        <Alert variant="success" title="Adresse vérifiée">
          L&apos;adresse {result.data.email} est désormais vérifiée. Vous pouvez vous connecter.
        </Alert>
      ) : (
        <Alert variant="danger" title="Vérification impossible">
          {result && !result.ok ? result.message : "Ce lien est invalide ou expiré."}
        </Alert>
      )}
    </AuthShell>
  );
}
