import type { MetadataRoute } from "next";
import { ROBOTS_DISALLOW, siteUrl } from "@/lib/seo";

/**
 * `/robots.txt` — généré par Next.js (aucun fichier statique à maintenir).
 *
 * Objectif : les moteurs indexent la page publique, jamais l'espace client, les API ni les liens
 * d'invitation. `Disallow` évite l'exploration ; il ne protège pas un accès (la sécurité réelle est
 * assurée par l'authentification et la RLS) — les pages concernées portent en plus `noindex`.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [...ROBOTS_DISALLOW],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
