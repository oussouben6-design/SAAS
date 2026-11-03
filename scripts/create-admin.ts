import { randomBytes } from "node:crypto";
import { createUserAccount } from "../src/lib/auth/service";
import { createOrganization } from "../src/modules/organization/service";
import { closeDb, privileged } from "../src/lib/db";

/**
 * Crée un compte réel (non démonstration) et son organisation, avec le rôle propriétaire.
 *
 *   npm run admin:create -- --email vous@exemple.com --name "Amina Diallo" --org "Sahel Conseil"
 *   npm run admin:create -- --email … --name … --org … --password '…'   # mot de passe choisi
 *   npm run admin:create -- --email … --name … --org … --country Niger --currency XOF \
 *                            --timezone Africa/Niamey --city Niamey --language fr
 *
 * Le mot de passe est généré (≥ 16 caractères) s'il n'est pas fourni : il est affiché une seule
 * fois, puis à changer après la première connexion (Paramètres → Mon profil).
 */

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

const email = arg("email");
const fullName = arg("name");
const organizationName = arg("org") ?? "Mon organisation";
const providedPassword = arg("password");

function fail(message: string): never {
  console.error(`[organix:admin] ${message}`);
  process.exit(1);
}

async function main() {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail("Adresse e-mail manquante ou invalide : --email vous@exemple.com");
  }
  if (!fullName || fullName.trim().length < 2) {
    fail("Nom complet manquant : --name \"Prénom Nom\"");
  }
  if (providedPassword && providedPassword.length < 12) {
    fail("Le mot de passe doit contenir au moins 12 caractères.");
  }

  if (email.toLowerCase().endsWith("@organix.local")) {
    fail(
      "Ce domaine est réservé aux comptes de démonstration. Utilisez une adresse réelle " +
        "(ex. vous@votre-organisation.com).",
    );
  }

  const existing = await privileged((tx) =>
    tx.query<{ id: string }>("select id from profiles where lower(email) = $1", [email.toLowerCase()]),
  );
  if (existing.length > 0) {
    fail(
      `Un compte existe déjà pour ${email}. Connectez-vous sur /connexion ` +
        "ou utilisez « Mot de passe oublié ».",
    );
  }

  const password = providedPassword ?? randomBytes(12).toString("base64url");
  const created = await createUserAccount({
    email,
    fullName: fullName.trim(),
    password,
    emailVerified: true,
  });
  if (!created.ok) fail(created.message);

  const organization = await createOrganization({
    userId: created.data.user.id,
    userEmail: email,
    name: organizationName.trim(),
    industry: arg("industry") ?? null,
    country: arg("country") ?? null,
    city: arg("city") ?? null,
    currency: arg("currency") ?? "XOF",
    timezone: arg("timezone") ?? "Africa/Niamey",
    language: arg("language") ?? "fr",
  });

  const [check] = await privileged((tx) =>
    tx.query<{ is_demo: boolean; role: string; permissions: number }>(
      `select o.is_demo,
              r.name as role,
              (select count(*)::int from role_permissions rp where rp.role_id = r.id) as permissions
         from organizations o
         join organization_members m on m.organization_id = o.id
         join roles r on r.organization_id = o.id and r.key = 'owner'
        where o.id = $1 and m.user_id = $2`,
      [organization.organizationId, created.data.user.id],
    ),
  );

  console.log("\n[organix:admin] Compte réel créé (aucune donnée de démonstration).\n");
  console.log(`  Organisation : ${organizationName}  (${organization.slug})`);
  console.log(`  Rôle         : ${check?.role ?? "propriétaire"} — ${check?.permissions ?? "?"} permissions`);
  console.log(`  Espace démo  : ${check?.is_demo ? "oui (anomalie)" : "non"}`);
  console.log(`  E-mail       : ${email}`);
  console.log(`  Mot de passe : ${password}`);
  console.log("\n  Connexion : /connexion — changez ce mot de passe après la première connexion.\n");
}

main()
  .catch((error: unknown) => {
    console.error(`[organix:admin] ÉCHEC : ${(error as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
