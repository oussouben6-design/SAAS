import { privileged } from "@/lib/db";
import { createOrganization } from "@/modules/organization/service";
import type { AuthUser } from "@/lib/auth/service";

/**
 * Mode personnel (« accès personnel sans compte »).
 *
 * OPTION ACTIF UNIQUEMENT SI PERSONAL_MODE=true (variable d'environnement du déploiement).
 * Dans ce mode, chaque requête est traitée comme l'unique propriétaire réel du
 * déploiement, sans aucun formulaire de compte ni mot de passe : le visiteur ouvre le
 * site et se retrouve dans l'application.
 *
 * - Le compte propriétaire réel (PERSONAL_OWNER_EMAIL, défaut personnel@organix.local)
 *   est créé au premier accès si absent, SANS identifiant de connexion.
 * - L'organisation réelle est créée au premier accès si absente (nom
 *   PERSONAL_ORG_NAME, défaut « Mon espace Excellence 360 ») : vide, is_demo=false,
 *   onboarding déjà validé — rien de fictif n'y est injecté.
 * - Le mode personnel est IGNORÉ partout ailleurs (prévisualisations, CI) : sans
 *   PERSONAL_MODE=true, le comportement est strictement inchangé (auth classique).
 *
 * SÉCURITÉ : sur un domaine public, ce mode ouvre toute l'application (clients,
 * finances, RH) à quiconque connaît l'adresse. N'activer que sur un déploiement
 * personnel, idéalement derrière une protection d'accès (ex. Vercel Password
 * Protection). Voir docs/mode-personnel.md.
 */

export function isPersonalMode(): boolean {
  return process.env.PERSONAL_MODE === "true";
}

export function personalOwnerEmail(): string {
  return (process.env.PERSONAL_OWNER_EMAIL ?? "personnel@organix.local").trim().toLowerCase();
}

function personalOwnerName(): string {
  const name = (process.env.PERSONAL_OWNER_NAME ?? "Moi").trim();
  return name.length >= 2 ? name : "Moi";
}

function personalOrgName(): string {
  const name = (process.env.PERSONAL_ORG_NAME ?? "Mon espace Excellence 360").trim();
  return name.length >= 2 ? name : "Mon espace Excellence 360";
}

type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  email_verified_at: string | null;
  is_active: boolean;
};

function mapProfile(row: ProfileRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    emailVerifiedAt: row.email_verified_at,
    isActive: row.is_active,
  };
}

export type PersonalWorkspace = {
  user: AuthUser;
};

const PLACEHOLDER_ID = "00000000-0000-4000-8000-000000000001"; // jamais persisté

/**
 * Identité placeholder, SANS aucun accès base — sûre à tout moment : build, pré-rendu
 * des pages statiques, ou simple besoin de connaître « sommes-nous en mode personnel ».
 * Les vraies requêtes (memberships, permissions, provisionnement) passent par
 * `ensurePersonalWorkspace()`.
 */
export function personalIdentity(): AuthUser {
  return {
    id: PLACEHOLDER_ID,
    email: personalOwnerEmail(),
    fullName: personalOwnerName(),
    avatarUrl: null,
    emailVerifiedAt: null,
    isActive: true,
  };
}

let warned = false;

/**
 * Garantit l'existence du compte personnel réel et d'au moins une organisation
 * réelle (is_demo=false) dont il est propriétaire. Idempotent et sans donnée
 * fictive ; appelé au plus fort sur le chemin d'accès (cache React par requête).
 */
export async function ensurePersonalWorkspace(): Promise<PersonalWorkspace> {
  if (!personalWorkspacePromise) {
    personalWorkspacePromise = provisionPersonalWorkspace().catch((error: unknown) => {
      // Échec transitoire (base occupée, verrou…) : ne pas mémoriser l'échec pour toujours.
      personalWorkspacePromise = null;
      throw error;
    });
  }
  return personalWorkspacePromise;
}

let personalWorkspacePromise: Promise<PersonalWorkspace> | null = null;

/** Provisionnement réel (compte + organisation). Mémoïsé par processus via ensurePersonalWorkspace. */
async function provisionPersonalWorkspace(): Promise<PersonalWorkspace> {
  if (!warned) {
    warned = true;
    console.warn(
      "[excellence360:personal] PERSONAL_MODE actif : accès sans authentification (usage personnel uniquement — le domaine ne doit pas être public).",
    );
  }

  const email = personalOwnerEmail();
  const existing = await privileged((tx) =>
    tx.query<ProfileRow>(
      `select id, email, full_name, avatar_url, email_verified_at, is_active
         from profiles where lower(email) = $1`,
      [email],
    ),
  );

  let user: AuthUser;
  if (existing[0]) {
    user = mapProfile(existing[0]);
  } else {
    const inserted = await privileged((tx) =>
      tx.query<ProfileRow>(
        `insert into profiles (email, full_name, email_verified_at)
         values ($1, $2, now())
         returning id, email, full_name, avatar_url, email_verified_at, is_active`,
        [email, personalOwnerName()],
      ),
    ).catch(async () => {
      // Course concurrente bénigne : un autre processus a créé le profil entre-temps.
      const again = await privileged((tx) =>
        tx.query<ProfileRow>(
          `select id, email, full_name, avatar_url, email_verified_at, is_active
             from profiles where lower(email) = $1`,
          [email],
        ),
      );
      if (!again[0]) throw new Error("Impossible de créer le profil personnel.");
      return again;
    });
    if (!inserted[0]) throw new Error("Impossible de créer le profil personnel.");
    user = mapProfile(inserted[0]);
  }

  const owned = await privileged((tx) =>
    tx.query<{ id: string }>(
      `select m.organization_id as id
         from organization_members m
         join organizations o on o.id = m.organization_id
        where m.user_id = $1 and m.status = 'active' and m.is_owner = true
          and o.deleted_at is null and o.is_demo = false
        order by o.created_at asc
        limit 1`,
      [user.id],
    ),
  );

  if (owned.length === 0) {
    await createOrganization({
      userId: user.id,
      userEmail: user.email,
      name: personalOrgName(),
      currency: process.env.PERSONAL_ORG_CURRENCY ?? "XOF",
      timezone: process.env.PERSONAL_ORG_TIMEZONE ?? "Africa/Niamey",
      language: "fr",
      isDemo: false,
    });
  }

  return { user };
}
