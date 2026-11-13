import type { Metadata } from "next";
import { AuthShell } from "@/components/layout/auth-shell";
import { getInvitation } from "@/modules/organization/invitations";
import { Alert } from "@/components/ui/misc";
import { AcceptInvitationForm } from "./accept-form";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Invitation",
  robots: { index: false, follow: false },
};

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invitation = await getInvitation(token);

  if (!invitation) {
    return (
      <AuthShell title="Invitation invalide">
        <Alert variant="danger" title="Lien inutilisable">
          Cette invitation est inconnue, a déjà été utilisée ou a expiré. Demandez une nouvelle
          invitation à un administrateur de l&apos;organisation.
        </Alert>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={`Rejoindre ${invitation.organizationName}`}
      subtitle={`Invitation pour ${invitation.email} · valable jusqu'au ${formatDateTime(invitation.expiresAt)}`}
    >
      <AcceptInvitationForm
        token={invitation.token}
        fullName={invitation.fullName}
        requiresPassword={invitation.requiresPassword}
      />
    </AuthShell>
  );
}
