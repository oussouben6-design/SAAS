import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, siteUrl } from "@/lib/seo";

/**
 * `/sitemap.xml` — uniquement les pages réellement publiques.
 *
 * Aucune URL de l'espace client n'y figure : elles exigent une session et ne doivent pas être
 * indexées. Ajouter une page ici suppose qu'elle est servie sans authentification, sinon 307
 * vers `/connexion` et signal « soft 404 » dans la Search Console.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const lastModified = new Date();
  return PUBLIC_PAGES.map((page) => ({
    url: `${base}${page.path}`,
    lastModified,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
