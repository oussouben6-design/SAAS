/**
 * Envoi d'e-mails transactionnels.
 *
 * Transport disponible aujourd'hui : `console` (développement) — le contenu est journalisé
 * côté serveur et le lien est renvoyé à l'appelant pour affichage en mode développement.
 *
 * Aucun fournisseur d'e-mail n'est configuré : les transports `smtp` et `resend` renvoient
 * explicitement `available: false` plutôt que de simuler un envoi. Voir docs/deployment/EMAIL.md.
 */

export type MailKind = "email_verification" | "password_reset" | "invitation";

export interface MailMessage {
  to: string;
  subject: string;
  kind: MailKind;
  actionUrl: string;
  /** Contenu texte additionnel (nom du destinataire, organisation…). */
  lines?: string[];
}

export interface MailResult {
  delivered: boolean;
  transport: string;
  /** Lien d'action renvoyé uniquement lorsque le transport console est utilisé en développement. */
  previewUrl?: string;
  warning?: string;
}

export function mailTransport(): "console" | "smtp" | "resend" | "none" {
  const value = (process.env.MAIL_TRANSPORT ?? "console").toLowerCase();
  if (value === "console" || value === "smtp" || value === "resend") return value;
  return "none";
}

export function appBaseUrl(): string {
  return (
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  const transport = mailTransport();

  if (transport === "console") {
    const isProduction = process.env.NODE_ENV === "production";
    console.info(
      `[organix:mail] ${message.kind} -> ${message.to} | ${message.subject} | ${message.actionUrl}`,
    );
    return {
      delivered: false,
      transport,
      previewUrl: isProduction ? undefined : message.actionUrl,
      warning: isProduction
        ? "Aucun transport d'e-mail configuré : le message n'a pas été envoyé."
        : "Mode développement : aucun e-mail n'a été envoyé, le lien est affiché ci-dessous.",
    };
  }

  if (transport === "none") {
    return {
      delivered: false,
      transport,
      warning: "Aucun transport d'e-mail n'est configuré (MAIL_TRANSPORT=none).",
    };
  }

  console.warn(`[organix:mail] Transport « ${transport} » non implémenté : message non envoyé.`);
  return {
    delivered: false,
    transport,
    warning: `Le transport d'e-mail « ${transport} » nest pas encore implémenté. Configurez MAIL_TRANSPORT=console ou consultez docs/deployment/EMAIL.md.`,
  };
}
