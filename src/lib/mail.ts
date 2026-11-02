/**
 * Envoi d'e-mails transactionnels.
 *
 * Transports :
 *  - `console` (défaut) : le message est journalisé, le lien est renvoyé à l'appelant (dev).
 *  - `resend` : appel HTTP à l'API Resend (`RESEND_API_KEY`, `MAIL_FROM`). Aucun SDK requis.
 *  - `smtp` : non implémenté ; renvoie explicitement un avertissement, jamais un faux succès.
 *
 * Dès qu'un envoi échoue, `delivered` vaut `false` et `warning` contient la raison réelle.
 * Voir docs/configuration.md pour les variables d'environnement.
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

  if (transport === "resend") {
    return sendWithResend(message);
  }

  console.warn(`[organix:mail] Transport « ${transport} » non implémenté : message non envoyé.`);
  return {
    delivered: false,
    transport,
    warning: "Le transport d'e-mail « smtp » n'est pas implémenté. Utilisez MAIL_TRANSPORT=console ou resend.",
  };
}

const MAIL_TEMPLATES: Record<MailKind, { heading: string; cta: string }> = {
  email_verification: { heading: "Vérifiez votre adresse e-mail", cta: "Vérifier mon adresse" },
  password_reset: { heading: "Réinitialisation du mot de passe", cta: "Choisir un nouveau mot de passe" },
  invitation: { heading: "Invitation à rejoindre ORGANIX", cta: "Accepter l'invitation" },
};

export function renderMail(message: MailMessage): { html: string; text: string } {
  const template = MAIL_TEMPLATES[message.kind];
  const lines = message.lines ?? [];
  const text = [
    template.heading,
    "",
    ...lines,
    "",
    `${template.cta} : ${message.actionUrl}`,
    "",
    "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="fr">
  <body style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#f6f7f9;padding:24px;color:#111827">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px;border:1px solid #e5e7eb">
      <p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#059669;margin:0 0 16px">ORGANIX</p>
      <h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(template.heading)}</h1>
      ${lines.map((line) => `<p style="font-size:14px;line-height:1.6;margin:0 0 12px">${escapeHtml(line)}</p>`).join("")}
      <p style="margin:24px 0">
        <a href="${escapeHtml(message.actionUrl)}" style="display:inline-block;background:#047857;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px">
          ${escapeHtml(template.cta)}
        </a>
      </p>
      <p style="font-size:12px;color:#6b7280;margin:0">
        Si le bouton ne fonctionne pas, copiez ce lien :<br />
        <span style="word-break:break-all">${escapeHtml(message.actionUrl)}</span>
      </p>
      <p style="font-size:12px;color:#6b7280;margin:16px 0 0">
        Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.
      </p>
    </div>
  </body>
</html>`;

  return { html, text };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Envoi via l'API HTTP Resend (aucune dépendance npm). */
async function sendWithResend(message: MailMessage): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!apiKey || !from) {
    return {
      delivered: false,
      transport: "resend",
      warning:
        "Transport resend sélectionné mais RESEND_API_KEY ou MAIL_FROM est absent : aucun e-mail envoyé.",
    };
  }

  const { html, text } = renderMail(message);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html,
        text,
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(`[organix:mail] Resend a refusé l'envoi (${response.status}): ${detail.slice(0, 300)}`);
      return {
        delivered: false,
        transport: "resend",
        warning: `Le fournisseur d'e-mail a refusé l'envoi (HTTP ${response.status}).`,
      };
    }
    return { delivered: true, transport: "resend" };
  } catch (error) {
    console.error("[organix:mail] Échec réseau vers Resend", error);
    return {
      delivered: false,
      transport: "resend",
      warning: "Impossible de joindre le fournisseur d'e-mail (erreur réseau).",
    };
  }
}
