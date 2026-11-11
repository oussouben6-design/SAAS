"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  cancelMfaLoginAction,
  demoLoginAction,
  loginAction,
  loginOtpAction,
  mfaLoginAction,
} from "../actions";
import { FormFeedback, SubmitButton } from "@/components/forms/form-dialog";
import { FormField, Input } from "@/components/ui/input";
import { AuthDivider, GoogleSignInButton } from "@/components/layout/google-signin";

/** Extrait le défi + (en développement) le code d'aperçu d'une réponse d'action. */
function challengeData(
  state: { ok: boolean; code?: string; data?: unknown } | null,
  code: "mfa_required" | "login_otp_required",
): { challenge: string; previewCode: string | null } | undefined {
  if (!state || state.ok || state.code !== code) return undefined;
  const data = state.data as { challenge?: string; previewCode?: string | null } | undefined;
  return data?.challenge ? { challenge: data.challenge, previewCode: data.previewCode ?? null } : undefined;
}

export function LoginForm({
  googleEnabled = false,
  initialChallenge,
  initialOtpChallenge,
}: {
  googleEnabled?: boolean;
  /** Défi MFA en attente après une connexion Google (transmis par cookie httpOnly). */
  initialChallenge?: string;
  /** Défi du code de connexion envoyé par e-mail, en attente (transmis par cookie httpOnly). */
  initialOtpChallenge?: string;
}) {
  const [state, formAction] = useActionState(loginAction, null);
  const [mfaState, mfaFormAction] = useActionState(mfaLoginAction, null);
  const [otpState, otpFormAction] = useActionState(loginOtpAction, null);

  const challengeFromLogin = challengeData(state, "mfa_required")?.challenge;
  const challenge = challengeFromLogin ?? initialChallenge;

  const otpFromMfa = challengeData(mfaState, "login_otp_required");
  const otpFromLogin = challengeData(state, "login_otp_required");
  const otp = otpFromMfa ?? otpFromLogin;
  const otpChallenge = otp?.challenge ?? initialOtpChallenge;
  const previewCode = otp?.previewCode ?? null;

  if (otpChallenge) {
    return (
      <div className="space-y-4">
        <form action={otpFormAction} className="space-y-4">
          <FormFeedback state={otpState} />
          <p className="text-sm text-muted-foreground">
            Pour terminer la connexion, saisissez le code à 6 chiffres qui vient d&apos;être envoyé à
            votre adresse e-mail. Il expire dans 10 minutes.
          </p>
          {previewCode ? (
            <p
              role="status"
              className="rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm font-medium text-foreground"
            >
              Mode développement : aucun e-mail n&apos;a été envoyé. Code :{" "}
              <span className="font-mono tracking-[0.3em]">{previewCode}</span>
            </p>
          ) : null}
          <input type="hidden" name="challenge" value={otpChallenge} />
          <FormField label="Code reçu par e-mail" htmlFor="otp" required>
            <Input
              id="otp"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              minLength={6}
              maxLength={6}
              pattern="[0-9]{6}"
              placeholder="123456"
              className="tracking-[0.3em]"
            />
          </FormField>
          <SubmitButton label="Vérifier le code" pendingLabel="Vérification…" className="w-full" />
        </form>
        <form action={cancelMfaLoginAction}>
          <button
            type="submit"
            className="block w-full text-center text-sm text-primary hover:underline"
          >
            Recommencer la connexion
          </button>
        </form>
      </div>
    );
  }

  if (challenge) {
    return (
      <div className="space-y-4">
        <form action={mfaFormAction} className="space-y-4">
          <FormFeedback state={mfaState} />
          <p className="text-sm text-muted-foreground">
            Double authentification active sur ce compte. Ouvrez votre application d&apos;authentification
            (Google Authenticator, Authy, 1Password…) et saisissez le code affiché, ou un code de secours.
          </p>
          <input type="hidden" name="challenge" value={challenge} />
          <FormField label="Code de vérification" htmlFor="code" required>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              placeholder="123456"
              className="tracking-[0.3em]"
            />
          </FormField>
          <SubmitButton label="Vérifier" pendingLabel="Vérification…" className="w-full" />
        </form>
        <form action={cancelMfaLoginAction}>
          <button
            type="submit"
            className="block w-full text-center text-sm text-primary hover:underline"
          >
            Recommencer la connexion
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Vérification Google en un clic : mise en avant, avant le formulaire. */}
      {googleEnabled ? <GoogleSignInButton /> : null}
      {/* Mode démo public : rejoint l'organisation de démonstration, sans compte. */}
      <form action={demoLoginAction}>
        <SubmitButton
          label="Explorer la démo — sans compte"
          pendingLabel="Ouverture de la démo…"
          variant="outline"
          className="h-11 w-full"
        />
      </form>
      <AuthDivider />
      <form action={formAction} className="space-y-4">
        <FormFeedback state={state} />
        <FormField label="Adresse e-mail" htmlFor="email" required>
          <Input id="email" name="email" type="email" autoComplete="email" required placeholder="vous@organisation.com" />
        </FormField>
        <FormField label="Mot de passe" htmlFor="password" required>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </FormField>
        <div className="flex items-center justify-between text-sm">
          <Link href="/mot-de-passe-oublie" className="text-primary hover:underline">
            Mot de passe oublié ?
          </Link>
        </div>
        <SubmitButton label="Se connecter" pendingLabel="Connexion…" className="w-full" />
      </form>
    </div>
  );
}
