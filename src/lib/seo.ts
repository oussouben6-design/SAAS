/**
 * Référencement (SEO) — source unique de l'adresse publique et des métadonnées.
 *
 * Domaine de production : https://360crm.excellence-services-sarl.com
 *
 * L'URL est lue dans `NEXT_PUBLIC_SITE_URL` (ou `APP_URL`), avec repli sur le domaine de
 * production : les balises canoniques, le sitemap et les données structurées ne doivent jamais
 * dépendre d'un `localhost` oublié dans une variable d'environnement.
 *
 * L'application est privée (espace client authentifié) : seules les pages publiques sont
 * indexables ; `/app`, les écrans d'authentification et les API sont explicitement exclus
 * (`src/app/robots.ts` + métadonnées `noindex`).
 */
import { APP_COMPANY, APP_NAME, APP_SLOGAN, APP_TAGLINE, LOGO_FULL } from "@/lib/brand";

/**
 * Sous-ensemble de l'environnement lu ici. Type volontairement lâche (pas `NodeJS.ProcessEnv`,
 * qui exige `NODE_ENV`) : la fonction reste testable avec un objet minimal.
 */
export interface SeoEnvironment {
  [key: string]: string | undefined;
}

/** Domaine de production, utilisé si aucune variable d'environnement ne le remplace. */
export const PRODUCTION_SITE_URL = "https://360crm.excellence-services-sarl.com";

function normalize(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

/**
 * URL publique absolue, sans slash final.
 * En développement, les variables locales (`http://localhost:3000`) restent prioritaires pour que
 * les liens d'e-mail et les aperçus de partage correspondent au serveur réellement utilisé.
 */
export function siteUrl(env: SeoEnvironment = process.env): string {
  const explicit = env.NEXT_PUBLIC_SITE_URL ?? env.APP_URL ?? env.NEXT_PUBLIC_APP_URL;
  if (explicit && explicit.trim().length > 0) return normalize(explicit);
  return PRODUCTION_SITE_URL;
}

/** Adresse absolue d'une ressource servie par l'application. */
export function absoluteUrl(path: string, env: SeoEnvironment = process.env): string {
  const base = siteUrl(env);
  if (/^https?:\/\//i.test(path)) return path;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export const SITE_NAME = APP_NAME;
export const SITE_DESCRIPTION =
  `${APP_TAGLINE}. ${APP_NAME}, édité par ${APP_COMPANY}, réunit clients, prospection, projets, ` +
  "tâches, finances (devis et factures), ressources humaines, partenaires et communication interne " +
  "dans un seul espace sécurisé, avec rôles, permissions et journal d'audit.";
export const SITE_KEYWORDS = [
  "CRM",
  "logiciel de gestion",
  "relation client",
  "gestion de projets",
  "devis et factures",
  "ressources humaines",
  "gestion des tâches",
  "tableau de bord",
  "Excellence 360 CRM",
  "Excellence Services",
  "Niger",
  "Niamey",
] as const;
export const SITE_LOCALE = "fr_FR";
export const SITE_LANGUAGE = "fr";
/** Image de partage (Open Graph / Twitter) : le logo complet, 3:2. */
export const SITE_OG_IMAGE = {
  url: absoluteUrl(LOGO_FULL),
  width: 1080,
  height: 720,
  alt: `${APP_NAME} — ${APP_COMPANY}. ${APP_SLOGAN}.`,
} as const;

/** Pages publiques indexables — alimente `sitemap.xml`. */
export interface PublicPage {
  path: string;
  title: string;
  description: string;
  changeFrequency: "daily" | "weekly" | "monthly" | "yearly";
  priority: number;
}

export const PUBLIC_PAGES: PublicPage[] = [
  {
    path: "/",
    title: `${APP_NAME} — ${APP_TAGLINE}`,
    description: SITE_DESCRIPTION,
    changeFrequency: "weekly",
    priority: 1,
  },
];

/**
 * Préfixes interdits aux robots : espace client, API, parcours d'authentification et jetons
 * d'invitation (une URL d'invitation indexée serait une fuite de lien privé).
 */
export const ROBOTS_DISALLOW = [
  "/app",
  "/app/",
  "/api/",
  "/connexion",
  "/inscription",
  "/onboarding",
  "/invitations/",
  "/mot-de-passe-oublie",
  "/reinitialiser-mot-de-passe",
  "/verifier-email",
] as const;

/**
 * Données structurées schema.org (JSON-LD) décrivant l'organisation éditrice et l'application.
 * Inoffensives à l'exécution : un bloc `application/ld+json` n'est pas du JavaScript exécuté.
 */
export function organizationJsonLd(env: SeoEnvironment = process.env) {
  const base = siteUrl(env);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${base}/#organization`,
        name: APP_COMPANY,
        url: base,
        logo: absoluteUrl(LOGO_FULL, env),
        slogan: APP_SLOGAN,
        description: `${APP_COMPANY} — ${APP_TAGLINE}.`,
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${base}/#application`,
        name: APP_NAME,
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "CRM",
        operatingSystem: "Web",
        url: base,
        inLanguage: SITE_LANGUAGE,
        description: SITE_DESCRIPTION,
        publisher: { "@id": `${base}/#organization` },
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "XOF",
          description: "Accès sur demande : espace de gestion multi-utilisateurs.",
        },
      },
    ],
  };
}
